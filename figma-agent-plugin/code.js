/** @internal — not part of @hirobius/design-system public API surface. */
figma.showUI(__html__, { width: 340, height: 480 });

// ── p5-3: HMAC auth (plugin side) ──────────────────────────────────────────
//
// The bridge requires every plugin→bridge POST /plugin-message to carry
// a signed envelope and a matching `Authorization: HMAC <hex>` header
// when authEnabled is true. The shared secret lives in
// `figma.clientStorage` (key `HDS_BRIDGE_SECRET`); first-time setup is
// driven by a UI prompt.
//
// Loading order:
//   1. Lazily fetch protocol-envelope.js from the bridge so we have
//      `ProtocolEnvelope.createEnvelope` available in the sandbox.
//   2. Read the secret from clientStorage. If absent, the sandbox stays
//      "unconfigured" and unsigned messages still go out — which the
//      bridge will reject IF authEnabled is on. The user fixes this by
//      pasting the secret into the UI prompt; the UI relays it back to
//      the sandbox via `set-bridge-secret` and we persist with setAsync.
//
// The implementation lives entirely in this file + ui.html. ui.html
// posts the body and adds the header; code.js owns the secret and the
// signing math.
var HDS_BRIDGE_SECRET_KEY = 'HDS_BRIDGE_SECRET';
var _bridgeSecret = null;            // cached after first read; updated on set
var _envelopeLibPromise = null;
var _secretBootPromise = null;

// ── 12l: bridge URL runtime config ─────────────────────────────────────────
//
// Bridge URL is persisted in figma.clientStorage (key hds.bridgeUrl).
// Default URL is the dev-machine bridge. Override per-user from the Settings panel
// in ui.html; the UI forwards the value via a `set-bridge-url` message which
// is persisted here so all sandbox fetch/EventSource calls stay consistent.
var HDS_BRIDGE_URL_KEY = 'hds.bridgeUrl';
var _bridgeUrl = 'http://localhost:3005';  // default; overwritten by loadBridgeUrl()
var _bridgeUrlBootPromise = null;

function loadBridgeUrl() {
  if (_bridgeUrlBootPromise) return _bridgeUrlBootPromise;
  _bridgeUrlBootPromise = figma.clientStorage.getAsync(HDS_BRIDGE_URL_KEY)
    .then(function(value) {
      if (typeof value === 'string' && value.length > 0) {
        _bridgeUrl = value;
      }
      // Notify the UI shell of the current URL so it can pre-fill the settings input.
      try {
        figma.ui.postMessage({ type: 'bridge-url-loaded', url: _bridgeUrl });
      } catch (_) {}
      return _bridgeUrl;
    })
    .catch(function() { return _bridgeUrl; });
  return _bridgeUrlBootPromise;
}

function persistBridgeUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return Promise.resolve(false);
  _bridgeUrl = value;
  return figma.clientStorage.setAsync(HDS_BRIDGE_URL_KEY, value)
    .then(function() {
      try { figma.ui.postMessage({ type: 'bridge-url-stored', url: value }); } catch (_) {}
      return true;
    })
    .catch(function(err) {
      console.log('[hds-bridge-url] clientStorage write failed: ' + err.message);
      return false;
    });
}

/** Returns the current bridge base URL. Always prefer this over the literal. */
function getBridgeUrl() { return _bridgeUrl; }

// Read the stored URL at boot.
loadBridgeUrl();

function loadEnvelopeLib() {
  if (typeof globalThis !== 'undefined' && globalThis.ProtocolEnvelope) {
    return Promise.resolve(globalThis.ProtocolEnvelope);
  }
  if (!_envelopeLibPromise) {
    _envelopeLibPromise = fetch(getBridgeUrl() + '/plugin-source/protocol-envelope.js')
      .then(function(res) {
        if (!res.ok) throw new Error('bridge returned ' + res.status);
        return res.text();
      })
      .then(function(src) {
        // Indirect eval so `var ProtocolEnvelope` lands on globalThis.
        (1, eval)(src);
        if (typeof globalThis === 'undefined' || !globalThis.ProtocolEnvelope) {
          throw new Error('protocol-envelope.js loaded but ProtocolEnvelope was not registered');
        }
        return globalThis.ProtocolEnvelope;
      })
      .catch(function(err) {
        _envelopeLibPromise = null;
        throw err;
      });
  }
  return _envelopeLibPromise;
}

// Read the shared secret from clientStorage on plugin boot. If absent,
// post a `bridge-secret-needed` message to the UI shell so the user can
// paste it in. This is one-time setup per Figma installation.
function loadBridgeSecret() {
  if (_secretBootPromise) return _secretBootPromise;
  _secretBootPromise = figma.clientStorage.getAsync(HDS_BRIDGE_SECRET_KEY)
    .then(function(value) {
      if (typeof value === 'string' && value.length > 0) {
        _bridgeSecret = value;
        try {
          figma.ui.postMessage({ type: 'bridge-secret-diagnostic', found: true, length: value.length });
        } catch (_) {}
        return value;
      }
      // Prompt the UI; resolution to a real secret happens via the
      // `set-bridge-secret` message handler below.
      try {
        figma.ui.postMessage({ type: 'bridge-secret-diagnostic', found: false, raw: typeof value });
        figma.ui.postMessage({ type: 'bridge-secret-needed' });
      } catch (_) {}
      return null;
    })
    .catch(function(err) {
      console.log('[hds-bridge-auth] clientStorage read failed: ' + err.message);
      try {
        figma.ui.postMessage({ type: 'bridge-secret-diagnostic', found: false, error: err.message });
      } catch (_) {}
      return null;
    });
  return _secretBootPromise;
}

// Persist a new secret. Called when the UI shell forwards the user's
// pasted value via `set-bridge-secret`.
function persistBridgeSecret(value) {
  if (typeof value !== 'string' || value.length === 0) return Promise.resolve(false);
  return figma.clientStorage.setAsync(HDS_BRIDGE_SECRET_KEY, value)
    .then(function() {
      _bridgeSecret = value;
      try { figma.ui.postMessage({ type: 'bridge-secret-stored' }); } catch (_) {}
      return true;
    })
    .catch(function(err) {
      console.log('[hds-bridge-auth] clientStorage write failed: ' + err.message);
      return false;
    });
}

// Kick off the secret read at boot. The promise resolves to either the
// stored secret or null; downstream callers fall back to unsigned
// transport (which the bridge rejects only when authEnabled is on).
loadBridgeSecret();

// ── p5-2/p5-3: request/response correlation (plugin side) ─────────────────
//
// The bridge tracks pending requests by `envelope.id`. When the plugin
// sandbox replies, it MUST echo the original id as `inReplyTo` so the
// bridge can resolve the matching pending Promise. The plugin sandbox
// has no fetch-back path that talks directly to /plugin-message, so
// reply messages are routed via the UI shell:
//   code.js → figma.ui.postMessage → ui.html → POST /plugin-message.
//
// p5-3 upgrade: when the secret is available, the sandbox builds a
// signed envelope here and ships envelope+hmac to the UI. The UI shell
// is responsible only for transport (adding the Authorization header
// and POSTing). When no secret is available the sandbox falls back to
// the legacy unsigned shape — which the bridge accepts only when
// authEnabled is off.
function replyToBridge(inboundEnvelopeOrId, reply) {
  var inReplyTo = null;
  if (typeof inboundEnvelopeOrId === 'string') {
    inReplyTo = inboundEnvelopeOrId;
  } else if (inboundEnvelopeOrId && typeof inboundEnvelopeOrId === 'object') {
    if (typeof inboundEnvelopeOrId.id === 'string') inReplyTo = inboundEnvelopeOrId.id;
  }
  if (!inReplyTo) return false;

  var replyPayload = (reply && typeof reply === 'object') ? reply : { ok: true };
  var legacyBody = Object.assign({ type: 'reply', inReplyTo: inReplyTo }, replyPayload);

  // Best-effort: try to build a signed envelope. If the secret or the
  // envelope library isn't loaded yet we ship the legacy unsigned shape
  // and the UI shell skips the Authorization header. The bridge accepts
  // that ONLY when authEnabled is off.
  Promise.all([loadEnvelopeLib().catch(function() { return null; }), loadBridgeSecret()])
    .then(function(results) {
      var lib = results[0];
      var secret = _bridgeSecret;
      if (lib && secret) {
        try {
          var env = lib.createEnvelope('reply', legacyBody, secret);
          figma.ui.postMessage({
            type: 'bridge-reply',
            envelope: env,
            // Mirror inReplyTo at the top level so legacy transport
            // (auth off) still works without unwrapping.
            inReplyTo: inReplyTo,
            reply: replyPayload,
          });
          return;
        } catch (_) {
          // fall through to legacy path
        }
      }
      figma.ui.postMessage({
        type: 'bridge-reply',
        inReplyTo: inReplyTo,
        reply: replyPayload,
      });
    });
  return true;
}
// Expose for ad-hoc invocation in future units (p5-4 onward).
if (typeof globalThis !== 'undefined') globalThis.__hdsReplyToBridge = replyToBridge;

// ── p5-4: plugin runtime-error channel (sandbox side) ──────────────────────
//
// Closed set of error codes the bridge accepts. Anything outside this set
// is coerced to UNKNOWN downstream — keep the sandbox honest by reusing the
// same constant here. NEVER post raw stack traces or Figma API internals
// in `message`; sanitize to a one-line user-facing string.
var HDS_RUNTIME_ERROR_CODES = ['MISSING_MASTER', 'FONT_LOAD_FAILED', 'UNKNOWN_TOKEN_PATH', 'UNKNOWN'];

function classifyRenderError(err) {
  var raw = (err && (err.message || err.toString && err.toString())) || '';
  var lower = String(raw).toLowerCase();
  if (lower.indexOf('font') !== -1 || lower.indexOf('loadfontasync') !== -1) {
    return 'FONT_LOAD_FAILED';
  }
  if (lower.indexOf('master') !== -1 || lower.indexOf('component not found') !== -1 ||
      lower.indexOf('importcomponentbykey') !== -1) {
    return 'MISSING_MASTER';
  }
  if (lower.indexOf('token') !== -1 || lower.indexOf('variable') !== -1 ||
      lower.indexOf('var(--') !== -1) {
    return 'UNKNOWN_TOKEN_PATH';
  }
  return 'UNKNOWN';
}

function sanitizeErrorMessage(err) {
  var raw = (err && (err.message || (err.toString && err.toString()))) || 'unknown error';
  // Force to single line; clip to 200 chars so accidental stack-trace
  // fragments don't leak. Strip any literal newlines.
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Post a `render-error` envelope back to the bridge so the retry loop
 * sees the failure. Routed via the same UI shell path as ordinary
 * replies (replyToBridge → bridge-reply → POST /plugin-message).
 *
 * @param {string|object} inboundEnvelopeOrId  original envelope or its id
 * @param {string} code                        one of HDS_RUNTIME_ERROR_CODES
 * @param {string} message                     one-line, no stack traces
 * @returns {boolean}                          true if routing was attempted
 */
function sendRenderError(inboundEnvelopeOrId, code, message) {
  var safeCode = HDS_RUNTIME_ERROR_CODES.indexOf(code) === -1 ? 'UNKNOWN' : code;
  var safeMessage = typeof message === 'string'
    ? message.replace(/\s+/g, ' ').trim().slice(0, 200)
    : '';
  return replyToBridge(inboundEnvelopeOrId, {
    type: 'render-error',
    code: safeCode,
    message: safeMessage,
  });
}
if (typeof globalThis !== 'undefined') globalThis.__hdsSendRenderError = sendRenderError;

// ── HDS Component Registry ─────────────────────────────────────────────────
// Indexed at plugin boot so INSTANCE commands resolve real Figma components
// without a per-command traversal. Keys are lowercase for case-insensitive
// lookup; values are COMPONENT or COMPONENT_SET nodes.
const hdsComponentRegistry = new Map();

function indexHdsComponents() {
  var found = figma.root.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
  hdsComponentRegistry.clear();
  for (var _ri = 0; _ri < found.length; _ri++) {
    hdsComponentRegistry.set(found[_ri].name.toLowerCase(), found[_ri]);
  }
  console.log('[registry] indexed ' + hdsComponentRegistry.size + ' component(s)');
}
indexHdsComponents();

// Case-insensitive registry lookup with several fallback strategies so the LLM
// doesn't crash the pipeline if it slightly misnames a component.
function registryLookup(rawName) {
  if (!rawName) return null;
  var lower = String(rawName).toLowerCase().trim();
  // 1. Exact case-insensitive match
  if (hdsComponentRegistry.has(lower)) return hdsComponentRegistry.get(lower);
  // 2. Prefix / variant match (e.g. "HdsButton" → "HdsButton/Primary=default")
  for (var _iter = hdsComponentRegistry.entries(), _step = _iter.next(); !_step.done; _step = _iter.next()) {
    var key = _step.value[0];
    var val = _step.value[1];
    var base = key.split('/')[0].split('=')[0].trim();
    if (base === lower || key.startsWith(lower)) return val;
  }
  // 3. Strip leading "Hds" and retry (e.g. "Button" → "HdsButton")
  var stripped = lower.startsWith('hds') ? lower.slice(3) : lower;
  for (var _iter2 = hdsComponentRegistry.entries(), _step2 = _iter2.next(); !_step2.done; _step2 = _iter2.next()) {
    var k2 = _step2.value[0]; var v2 = _step2.value[1];
    var b2 = (k2.startsWith('hds') ? k2.slice(3) : k2).split('/')[0].trim();
    if (b2 === stripped || b2.startsWith(stripped)) return v2;
  }
  return null;
}

// Apply command.attributes + fallback props to a Figma instance via setProperties().
// Figma property keys look like "Variant#1234" — we match by substring so
// {"variant":"primary"} maps to whatever key contains "variant".
function applyInstanceAttributes(instance, attributes, fallbackProps) {
  if (!instance || !instance.componentProperties || !instance.setProperties) return;
  var propKeys = Object.keys(instance.componentProperties);
  var all = Object.assign({}, fallbackProps || {}, attributes || {});
  var updates = {};
  for (var attrKey in all) {
    var lowerAttr = attrKey.toLowerCase();
    for (var pi = 0; pi < propKeys.length; pi++) {
      var pk = propKeys[pi].toLowerCase().replace(/[^a-z]/g, '');
      if (pk === lowerAttr || pk.indexOf(lowerAttr) !== -1 || lowerAttr.indexOf(pk) !== -1) {
        updates[propKeys[pi]] = all[attrKey];
        break;
      }
    }
  }
  try { if (Object.keys(updates).length) instance.setProperties(updates); } catch (_) {}
}

// Override the primary text node inside a Figma instance (cannot just append a
// TEXT child to an INSTANCE). Picks the text node with the largest fontSize as
// the "primary" label and overwrites its characters.
async function applyInstanceText(instance, text) {
  if (!text || !instance) return;
  var textNodes;
  try { textNodes = instance.findAll(function(n) { return n.type === 'TEXT'; }); } catch (_) { return; }
  if (!textNodes || !textNodes.length) return;
  var primary = textNodes[0];
  for (var ti = 1; ti < textNodes.length; ti++) {
    if ((textNodes[ti].fontSize || 0) >= (primary.fontSize || 0)) primary = textNodes[ti];
  }
  try {
    await figma.loadFontAsync(primary.fontName);
    primary.characters = String(text);
  } catch (_) {}
}

// Lazily fetch sync-tokens.js via the local bridge and install
// `globalThis.HDSSyncTokens`. Plugin sandbox has no module system, so the
// canonical engine source lives in figma-agent-plugin/sync-tokens.js and is
// served by scripts/hds-bridge.mjs at /plugin-source/sync-tokens.js.
let _syncEnginePromise = null;
function loadSyncEngine() {
  if (typeof globalThis !== 'undefined' && globalThis.HDSSyncTokens) {
    return Promise.resolve(globalThis.HDSSyncTokens);
  }
  if (!_syncEnginePromise) {
    _syncEnginePromise = fetch(getBridgeUrl() + '/plugin-source/sync-tokens.js')
      .then((res) => {
        if (!res.ok) throw new Error('bridge returned ' + res.status);
        return res.text();
      })
      .then((src) => {
        // Use indirect eval so the script installs into the global scope.
        (1, eval)(src);
        if (typeof globalThis === 'undefined' || !globalThis.HDSSyncTokens) {
          throw new Error('sync-tokens.js loaded but HDSSyncTokens was not registered');
        }
        return globalThis.HDSSyncTokens;
      })
      .catch((err) => {
        // Reset so a future click can retry after the bridge comes online.
        _syncEnginePromise = null;
        throw err;
      });
  }
  return _syncEnginePromise;
}

const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255
});

const rgbToHex = (color) => {
  const f = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${f(color.r)}${f(color.g)}${f(color.b)}`.toUpperCase();
};

const streamNodes = { root: figma.currentPage };
const streamPendingChildren = {};
const streamFontPromises = {};
let streamManifestPromise = null;
let streamVariableMapPromise = null;

function streamClamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function streamNormalizeTokenPath(path) {
  if (typeof path !== 'string') return '';
  return path.replace(/[{}]/g, '').trim();
}

function streamTokenEntries(manifest) {
  const tokens = manifest && manifest.tokens ? manifest.tokens : {};
  return []
    .concat(tokens.primitive || [])
    .concat(tokens.semantic || [])
    .concat(tokens.component || []);
}

function streamLoadManifest() {
  if (!streamManifestPromise) {
    streamManifestPromise = fetch(getBridgeUrl() + '/get-manifest')
      .then(function(res) { return res.json(); })
      .catch(function(err) {
        console.log('[llm-stream] manifest unavailable: ' + err.message);
        return { componentInventory: [], componentSpecs: {}, tokens: {} };
      });
  }
  return streamManifestPromise;
}

// Standardize a Figma variable name to dot-notation. Figma stores names with
// either `/` (folder grouping in the UI) or `-` (literal dashes) — and a single
// file can mix both. Collapse runs of separators, strip leading/trailing
// separators, and preserve case (e.g. `paddingX` stays `paddingX`).
const streamNormalizeVarName = (raw) => String(raw || '')
  .trim()
  .replace(/[\/\-]+/g, '.')
  .replace(/\.+/g, '.')
  .replace(/^\.+|\.+$/g, '');

function streamLoadVariableMap() {
  if (!streamVariableMapPromise) {
    streamVariableMapPromise = Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync()
    ]).then(([collections, variables]) => {
      const byCollectionId = {};
      const varByTokenPath = {};

      for (const c of collections) byCollectionId[c.id] = c;

      for (const variable of variables) {
        const collection = byCollectionId[variable.variableCollectionId];
        if (!collection || collection.name.indexOf('HDS') !== 0) continue;

        let tier = '';
        if (collection.name === 'HDS Primitive') tier = 'primitive';
        else if (collection.name === 'HDS Semantic') tier = 'semantic';
        else if (collection.name === 'HDS Component') tier = 'component';
        else continue;

        const nameDotted = streamNormalizeVarName(variable.name);
        if (!nameDotted) continue;

        // Primitive COLOR vars are usually named "blue-100" (no `color` prefix
        // in the variable name itself). Promote them to "primitive.color.blue.100"
        // unless the name is already prefixed with "color." (e.g. imported libs).
        // FLOAT primitives keep whatever segment they ship with (e.g. "space.4").
        let key;
        if (
          tier === 'primitive' &&
          variable.resolvedType === 'COLOR' &&
          nameDotted.indexOf('color.') !== 0
        ) {
          key = `primitive.color.${nameDotted}`;
        } else {
          key = `${tier}.${nameDotted}`;
        }

        varByTokenPath[key] = variable;
      }

      console.log('Registered Variables:', Object.keys(varByTokenPath));
      return varByTokenPath;
    }).catch((err) => {
      console.log('[llm-stream] variable map unavailable: ' + err.message);
      return {};
    });
  }
  return streamVariableMapPromise;
}

function streamResolveManifestToken(manifest, tokenPath) {
  var normalized = streamNormalizeTokenPath(tokenPath);
  var tokens = streamTokenEntries(manifest);
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].path === normalized) return tokens[i];
  }
  return null;
}

function streamResolveDimensionSync(raw, manifest) {
  if (typeof raw === 'number' && !isNaN(raw)) return raw;
  if (typeof raw !== 'string') return null;

  var direct = parseFloat(raw);
  if (raw.match(/^-?\d+(\.\d+)?px$/) && !isNaN(direct)) return direct;

  var token = streamResolveManifestToken(manifest, raw);
  var value = token && (token.resolvedValue || token.value);
  if (typeof value === 'string') {
    var parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }

  var pxAlias = raw.match(/\.px(\d+)$/);
  if (pxAlias) return Number(pxAlias[1]);

  var primitiveStep = raw.match(/\.space\.(\d+)$/);
  if (primitiveStep) return Number(primitiveStep[1]) * 4;

  return null;
}

function streamResolveColorSync(raw, manifest) {
  if (!raw) return null;
  if (typeof raw === 'object' && typeof raw.r === 'number') {
    return {
      r: streamClamp01(raw.r),
      g: streamClamp01(raw.g),
      b: streamClamp01(raw.b)
    };
  }

  if (typeof raw !== 'string') return null;

  var value = raw;
  if (raw.charAt(0) !== '#') {
    var token = streamResolveManifestToken(manifest, raw);
    value = token && (token.resolvedValue || token.value);
  }

  if (typeof value === 'string' && value.match(/^#[0-9a-fA-F]{6}$/)) {
    return hexToRgb(value);
  }

  return null;
}

function streamBindVariableAsync(node, prop, tokenPath) {
  var normalized = streamNormalizeTokenPath(tokenPath);
  if (!normalized) return;

  streamLoadVariableMap().then(function(variableMap) {
    var variable = variableMap[normalized];
    if (!variable) {
      console.warn('[HDS Token Missing]', normalized);
      return;
    }
    try {
      node.setBoundVariable(prop, variable);
    } catch (err) {
      console.log('[llm-stream] variable bind failed for ' + prop + ': ' + err.message);
    }
  });
}

function streamPaintAsync(raw, manifest, paintField) {
  var color = streamResolveColorSync(raw, manifest);
  var tokenPath = typeof raw === 'string' ? streamNormalizeTokenPath(raw) : '';

  if (!color) {
    // Manifest couldn't resolve a hex (e.g. semantic alias with no resolvedValue).
    // Still attempt to bind a Figma variable for the token path so the node gets
    // a live color link even when the manifest lacks the raw hex.
    if (!tokenPath) {
      console.warn('[HDS Token Missing]', typeof raw === 'string' ? raw : String(raw));
      return Promise.resolve(null);
    }
    return streamLoadVariableMap().then(function(variableMap) {
      var variable = variableMap[tokenPath];
      if (!variable) {
        console.warn('[HDS Token Missing]', tokenPath);
        return null;
      }
      var placeholder = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
      try {
        return figma.variables.setBoundVariableForPaint(placeholder, paintField || 'color', variable);
      } catch (_) {
        return null;
      }
    });
  }

  var paint = { type: 'SOLID', color: color };
  if (!tokenPath) return Promise.resolve(paint);

  return streamLoadVariableMap().then(function(variableMap) {
    var variable = variableMap[tokenPath];
    if (!variable) {
      console.warn('[HDS Token Missing]', tokenPath);
      return paint;
    }
    try {
      return figma.variables.setBoundVariableForPaint(paint, paintField || 'color', variable);
    } catch (_) {
      return paint;
    }
  });
}

function streamApplyDimension(node, prop, raw, manifest) {
  var value = streamResolveDimensionSync(raw, manifest);
  if (value === null) return;
  try { node[prop] = value; } catch (_) {}
  if (typeof raw === 'string') streamBindVariableAsync(node, prop, raw);
}

function streamApplyFills(node, props, manifest) {
  var fillRaw = props.fill || props.background || props.fills;
  if (!fillRaw) return;

  // Handle arrays: [{r,g,b}] or [{type:'SOLID',color:{…}}] — convert in-place.
  if (Array.isArray(fillRaw)) {
    var paints = fillRaw.map(function(f) {
      if (!f || typeof f !== 'object') return null;
      if (typeof f.r === 'number') {
        return { type: 'SOLID', color: { r: streamClamp01(f.r), g: streamClamp01(f.g), b: streamClamp01(f.b) } };
      }
      if (f.type === 'SOLID' && f.color) return f;
      return null;
    }).filter(Boolean);
    if (paints.length) { try { node.fills = paints; } catch (_) {} }
    return;
  }

  var fillPromise = streamPaintAsync(fillRaw, manifest, 'color');
  if (!fillPromise) return;
  fillPromise.then(function(paint) {
    if (!paint) return;
    try { node.fills = [paint]; } catch (_) {}
  });
}

function streamApplyStroke(node, props, manifest) {
  if (!props.stroke) return;
  var strokePromise = streamPaintAsync(props.stroke, manifest, 'color');
  if (!strokePromise) return;
  strokePromise.then(function(paint) {
    if (!paint) return;
    try { node.strokes = [paint]; } catch (_) {}
  });
  streamApplyDimension(node, 'strokeWeight', props.strokeWeight || 1, manifest);
}

function streamApplyGeometry(node, props, manifest) {
  if (typeof props.x === 'number') {
    try { node.x = props.x; } catch (_) {}
  }
  if (typeof props.y === 'number') {
    try { node.y = props.y; } catch (_) {}
  }

  var width = props.width === 'fill' ? null : streamResolveDimensionSync(props.width, manifest);
  var height = props.height === 'fill' ? null : streamResolveDimensionSync(props.height, manifest);
  if (width !== null || height !== null) {
    var nextWidth = width !== null ? Math.max(width, 1) : Math.max(node.width || 1, 1);
    var nextHeight = height !== null ? Math.max(height, 1) : Math.max(node.height || 1, 1);
    try { node.resize(nextWidth, nextHeight); } catch (_) {}
  }

  if (props.layoutMode === 'VERTICAL' || props.layoutMode === 'HORIZONTAL') {
    try { node.layoutMode = props.layoutMode; } catch (_) {}
  }

  if (props.primaryAxisSizingMode === 'AUTO' || props.primaryAxisSizingMode === 'FIXED') {
    try { node.primaryAxisSizingMode = props.primaryAxisSizingMode; } catch (_) {}
  }
  if (props.counterAxisSizingMode === 'AUTO' || props.counterAxisSizingMode === 'FIXED') {
    try { node.counterAxisSizingMode = props.counterAxisSizingMode; } catch (_) {}
  }

  if (props.primaryAxisAlignItems) {
    try { node.primaryAxisAlignItems = props.primaryAxisAlignItems; } catch (_) {}
  }
  if (props.counterAxisAlignItems) {
    try { node.counterAxisAlignItems = props.counterAxisAlignItems; } catch (_) {}
  }

  if (props.padding !== undefined) {
    streamApplyDimension(node, 'paddingTop', props.padding, manifest);
    streamApplyDimension(node, 'paddingRight', props.padding, manifest);
    streamApplyDimension(node, 'paddingBottom', props.padding, manifest);
    streamApplyDimension(node, 'paddingLeft', props.padding, manifest);
  }
  if (props.paddingX !== undefined) {
    streamApplyDimension(node, 'paddingLeft', props.paddingX, manifest);
    streamApplyDimension(node, 'paddingRight', props.paddingX, manifest);
  }
  if (props.paddingY !== undefined) {
    streamApplyDimension(node, 'paddingTop', props.paddingY, manifest);
    streamApplyDimension(node, 'paddingBottom', props.paddingY, manifest);
  }

  streamApplyDimension(node, 'paddingTop', props.paddingTop, manifest);
  streamApplyDimension(node, 'paddingRight', props.paddingRight, manifest);
  streamApplyDimension(node, 'paddingBottom', props.paddingBottom, manifest);
  streamApplyDimension(node, 'paddingLeft', props.paddingLeft, manifest);
  streamApplyDimension(node, 'itemSpacing', props.itemSpacing !== undefined ? props.itemSpacing : props.gap, manifest);
  streamApplyDimension(node, 'cornerRadius', props.cornerRadius !== undefined ? props.cornerRadius : props.radius, manifest);
}

function streamApplyFrameProps(node, props, manifest) {
  if (props.name) node.name = String(props.name);

  streamApplyGeometry(node, props, manifest);

  streamApplyFills(node, props, manifest);
  streamApplyStroke(node, props, manifest);
}

function streamEnsureFont(fontName) {
  var family = fontName && fontName.family ? fontName.family : 'Inter';
  var style = fontName && fontName.style ? fontName.style : 'Regular';
  var key = family + '::' + style;

  if (!streamFontPromises[key]) {
    streamFontPromises[key] = figma.loadFontAsync({ family: family, style: style }).catch(function() {
      if (family === 'Inter') return null;
      return figma.loadFontAsync({ family: 'Inter', style: style }).catch(function() {
        return figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      });
    });
  }

  return streamFontPromises[key].then(function() {
    return { family: family, style: style };
  }).catch(function() {
    return { family: 'Inter', style: 'Regular' };
  });
}

function streamTypographyFromToken(props) {
  var tokenName = typeof props.typography === 'string' ? props.typography : '';
  var weight = props.fontWeight || 400;
  var style = weight >= 600 ? 'Bold' : 'Regular';
  var size = props.fontSize || 16;

  if (tokenName.indexOf('heading') !== -1) {
    style = 'Bold';
    if (tokenName.indexOf('heading3') !== -1) size = 24;
    else if (tokenName.indexOf('heading2') !== -1) size = 30;
    else size = 36;
  } else if (tokenName.indexOf('caption') !== -1) {
    size = 13;
  } else if (tokenName.indexOf('ui') !== -1) {
    size = 15;
  } else if (tokenName.indexOf('display') !== -1) {
    style = 'Bold';
    size = 48;
  }

  return { family: props.fontFamily || 'Atkinson Hyperlegible Next', style: props.fontStyle || style, size: size };
}

async function streamApplyTextProps(node, props, manifest) {
  // Resolve typography (family, style, size) from the token BEFORE loading fonts.
  var typography = streamTypographyFromToken(props);

  // streamEnsureFont loads the desired family/style and falls back to Inter if
  // the family is not installed in Figma. Pre-load Inter variants so the fallback
  // path never throws.
  await figma.loadFontAsync({ family: "Inter", style: "Regular" }).catch(function() {});
  await figma.loadFontAsync({ family: "Inter", style: "Bold" }).catch(function() {});
  var resolvedFont = await streamEnsureFont({ family: typography.family, style: typography.style });

  if (props.name) node.name = String(props.name);

  node.textAutoResize = props.width ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
  streamApplyFills(node, props, manifest);

  node.fontName = resolvedFont;
  node.fontSize = typography.size;
  try { node.characters = typeof props.characters === 'string' ? props.characters : (typeof props.text === 'string' ? props.text : ''); } catch (_) {}
  if (props.textAlignHorizontal) {
    try { node.textAlignHorizontal = props.textAlignHorizontal; } catch (_) {}
  }

  streamApplyGeometry(node, props, manifest);
}

function streamAppendNode(node, parentId) {
  var parent = streamNodes[parentId] || figma.currentPage;
  try { parent.appendChild(node); } catch (_) { figma.currentPage.appendChild(node); }
}

function streamFlushPendingChildren(parentId) {
  var pending = streamPendingChildren[parentId];
  if (!pending || !pending.length) return;
  var parent = streamNodes[parentId];
  if (!parent) return;

  for (var i = 0; i < pending.length; i++) {
    try { parent.appendChild(pending[i]); } catch (_) {}
  }
  delete streamPendingChildren[parentId];
}

function streamManifestHasComponent(manifest, componentName) {
  if (!componentName) return false;
  var specs = manifest.componentSpecs || {};
  if (specs[componentName]) return true;
  var inventory = manifest.componentInventory || [];
  return inventory.indexOf(componentName) !== -1;
}

function streamFindLocalComponent(componentName) {
  var matches = figma.root.findAll(function(node) {
    return (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') && node.name.indexOf(componentName) === 0;
  });
  if (!matches.length) return null;
  return matches[0];
}

function streamApplyInstanceProperties(instance, props) {
  if (!instance || !instance.componentProperties || !instance.setProperties) return;

  var updates = {};
  var keys = Object.keys(instance.componentProperties);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var lower = key.toLowerCase();
    if (props.variant && lower.indexOf('variant') !== -1) updates[key] = props.variant;
    if (props.text && (lower.indexOf('text') !== -1 || lower.indexOf('label') !== -1)) updates[key] = props.text;
    if (props.label && lower.indexOf('label') !== -1) updates[key] = props.label;
    if (props.placeholder && lower.indexOf('placeholder') !== -1) updates[key] = props.placeholder;
    if (props.type && lower.indexOf('type') !== -1) updates[key] = props.type;
  }

  try { instance.setProperties(updates); } catch (_) {}
}

async function streamCreatePlaceholderInstance(props, manifest) {
  var frame = figma.createFrame();
  frame.name = props.name || props.component || 'HDS Instance';
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.primaryAxisAlignItems = 'CENTER';
  frame.counterAxisAlignItems = 'CENTER';
  streamApplyDimension(frame, 'paddingLeft', 'component.button.paddingX', manifest);
  streamApplyDimension(frame, 'paddingRight', 'component.button.paddingX', manifest);
  streamApplyDimension(frame, 'paddingTop', 'component.button.paddingY', manifest);
  streamApplyDimension(frame, 'paddingBottom', 'component.button.paddingY', manifest);
  streamApplyDimension(frame, 'cornerRadius', 'semantic.radius.action', manifest);
  streamApplyFills(frame, { fill: 'semantic.color.surface.raised' }, manifest);
  streamApplyStroke(frame, { stroke: 'semantic.color.border.default' }, manifest);

  var label = figma.createText();
  await streamApplyTextProps(label, {
    name: 'Instance label',
    text: props.text || props.label || props.component || 'HDS Instance',
    typography: 'semantic.typography.ui',
    fill: 'semantic.color.content.primary'
  }, manifest);
  frame.appendChild(label);

  return frame;
}

function streamResolveInstanceAsync(placeholder, props, manifest, id) {
  var componentName = props.component;
  if (!streamManifestHasComponent(manifest, componentName)) {
    placeholder.name = 'Unmapped HDS component: ' + (componentName || 'Unknown');
    console.log('[llm-stream] blocked unmapped component: ' + componentName);
    return;
  }

  var local = streamFindLocalComponent(componentName);
  if (local) {
    try {
      var localInstance = local.type === 'COMPONENT_SET'
        ? local.defaultVariant.createInstance()
        : local.createInstance();
      localInstance.name = props.name || componentName;
      streamApplyInstanceProperties(localInstance, props);
      placeholder.parent.insertChild(placeholder.parent.children.indexOf(placeholder), localInstance);
      localInstance.x = placeholder.x;
      localInstance.y = placeholder.y;
      placeholder.remove();
      streamNodes[id] = localInstance;
      streamFlushPendingChildren(id);
      return;
    } catch (err) {
      console.log('[llm-stream] local component instance failed: ' + err.message);
    }
  }

  if (!figma.teamLibrary || !figma.teamLibrary.getAvailableComponentsAsync) return;

  figma.teamLibrary.getAvailableComponentsAsync().then(function(components) {
    var match = null;
    for (var i = 0; i < components.length; i++) {
      if (components[i].name.indexOf(componentName) === 0) {
        match = components[i];
        break;
      }
    }
    if (!match) return null;
    return figma.importComponentByKeyAsync(match.key);
  }).then(function(component) {
    if (!component) return;
    var instance = component.createInstance();
    instance.name = props.name || componentName;
    streamApplyInstanceProperties(instance, props);
    if (placeholder.removed) return;
    placeholder.parent.insertChild(placeholder.parent.children.indexOf(placeholder), instance);
    instance.x = placeholder.x;
    instance.y = placeholder.y;
    placeholder.remove();
    streamNodes[id] = instance;
    streamFlushPendingChildren(id);
  }).catch(function(err) {
    console.log('[llm-stream] library component lookup failed: ' + err.message);
  });
}

async function streamRenderAddNode(command) {
  // Block on BOTH the manifest fetch and the variable map hydration before
  // touching any renderer. Both helpers return cached singleton promises, so
  // this only pays the network/figma cost on the first ADD_NODE — every
  // subsequent command resolves on the next microtask without re-fetching.
  const [manifest] = await Promise.all([
    streamLoadManifest(),
    streamLoadVariableMap()
  ]);

  const id = command.id;
  const parentId = command.parentId || 'root';
  const props = command.props || {};
  let node = null;
  let instanceResolved = false;

  if (!id) return;

  if (command.type === 'FRAME') {
    node = figma.createFrame();
    node.name = props.name || id;
    streamApplyFrameProps(node, props, manifest);
  } else if (command.type === 'TEXT') {
    node = figma.createText();
    node.name = props.name || id;
    await streamApplyTextProps(node, props, manifest);
  } else if (command.type === 'INSTANCE') {
    // Registry path: componentName (new API) takes precedence over props.component (old API).
    // On a registry hit we create the real Figma instance, apply variant properties via
    // setProperties(), and override any text content directly in the instance's TEXT children.
    // If the registry has no match we fall through to the styled placeholder frame.
    var _rawName = command.componentName || props.component;
    var _registryNode = _rawName ? registryLookup(_rawName) : null;

    if (_registryNode) {
      try {
        var _source = _registryNode.type === 'COMPONENT_SET'
          ? _registryNode.defaultVariant
          : _registryNode;
        node = _source.createInstance();
        node.name = _rawName;
        applyInstanceAttributes(node, command.attributes, props);
        var _chars = command.characters || props.text || props.label;
        if (_chars) await applyInstanceText(node, _chars);
        instanceResolved = true;
      } catch (_instanceErr) {
        console.log('[registry] createInstance for "' + _rawName + '" failed: ' + _instanceErr.message + ' — using placeholder');
        node = null;
      }
    }

    if (!node) {
      node = await streamCreatePlaceholderInstance(props, manifest);
      if (_rawName) node.name = _rawName + ' [not found]';
    }

    streamApplyGeometry(node, props, manifest);
  } else if (command.type === 'ICON') {
    var iconRef = props.icon || 'ph:question-bold';
    var iconParts = iconRef.split(':');
    var iconSet  = iconParts[0] || 'ph';
    var iconName = iconParts[1] || 'question-bold';
    var iconSize = typeof props.size === 'number' ? Math.max(props.size, 1) : 24;

    try {
      var iconRes = await fetch('https://api.iconify.design/' + iconSet + '/' + iconName + '.svg');
      if (!iconRes.ok) throw new Error('HTTP ' + iconRes.status);
      var svgText = await iconRes.text();
      node = figma.createNodeFromSvg(svgText);
      node.name = props.name || iconRef;
      node.resize(iconSize, iconSize);
    } catch (iconErr) {
      console.log('[llm-stream] icon "' + iconRef + '" failed: ' + iconErr.message + ' — using placeholder');
      node = figma.createFrame();
      node.name = props.name || iconRef;
      node.fills = [];
      try { node.resize(iconSize, iconSize); } catch (_) {}
    }
  } else {
    console.log('[llm-stream] unsupported node type: ' + command.type);
    return;
  }

  streamNodes[id] = node;
  if (streamNodes[parentId]) {
    // Smart placement: scan the canvas right edge so new root frames never overlap
    // existing content. x/y from props (if any) are overridden intentionally here
    // because the LLM has no awareness of current canvas state.
    if (parentId === 'root' && node.type === 'FRAME') {
      var _rightEdge = 0;
      var _pageKids = figma.currentPage.children;
      for (var _ci = 0; _ci < _pageKids.length; _ci++) {
        var _kid = _pageKids[_ci];
        _rightEdge = Math.max(_rightEdge, (_kid.x || 0) + (_kid.width || 0));
      }
      if (_rightEdge > 0) {
        try { node.x = _rightEdge + 100; } catch (_) {}
      }
    }
    streamAppendNode(node, parentId);
  } else {
    streamAppendNode(node, 'root');
    if (!streamPendingChildren[parentId]) streamPendingChildren[parentId] = [];
    streamPendingChildren[parentId].push(node);
  }
  streamFlushPendingChildren(id);

  // p6-1: persist a11y metadata emitted by p4-4 onto the node so the
  // selection serializer's read path (extractNodeA11y) can surface it
  // later. We always write on ADD_NODE — independent of the
  // selectionSerializerEnabled flag — so flipping the flag on never has
  // to backfill historical nodes. Cost is one tiny pluginData blob per
  // a11y-tagged node.
  persistA11yPluginData(node, command && command.a11y);

  if (command.type === 'INSTANCE' && !instanceResolved) {
    streamResolveInstanceAsync(node, props, manifest, id);
  }
}

// Write {name, role, description} from a p4-4 a11y emission onto the node.
// Quietly no-ops on missing inputs — the compiler omits `a11y` for nodes
// without aria-label / role / description attrs, so most ADD_NODE commands
// will skip this path.
function persistA11yPluginData(node, a11y) {
  if (!node || !a11y || typeof a11y !== 'object') return;
  // Only persist the three documented fields, drop anything else.
  var clean = {};
  var any = false;
  if (typeof a11y.name === 'string' && a11y.name.length) { clean.name = a11y.name; any = true; }
  if (typeof a11y.role === 'string' && a11y.role.length) { clean.role = a11y.role; any = true; }
  if (typeof a11y.description === 'string' && a11y.description.length) {
    clean.description = a11y.description; any = true;
  }
  if (!any) return;
  try {
    if (node.setPluginData) node.setPluginData('hdsA11y', JSON.stringify(clean));
  } catch (_) { /* best-effort — pluginData write should never crash a render */ }
}

// ── p6-1: manifest-aware selection serializer ─────────────────────────────
//
// extractNodeTree() walks the current Figma selection and emits a JSON tree
// the bridge can hand to validators (p6-2 lint, p6-3 contrast, p6-5 fix-mode).
// The legacy shape is {id, name, type, width, height, x, y, fills,
// boundVariables, children} — dumb geometry only. Phase 6 work needs the
// serializer to be *manifest-aware*, surfacing:
//
//   * componentName  — the manifest spec key for INSTANCE / COMPONENT /
//                      COMPONENT_SET nodes (resolved via the boot-time
//                      hdsComponentRegistry + manifest.componentSpecs).
//   * tokenPaths     — boundVariables with each Figma variable id swapped
//                      out for its dot-notation token path
//                      (e.g. "semantic.color.surface.raised"), so a
//                      validator can compare against manifest tokenBindings
//                      without re-reading the local variable collection.
//   * a11y           — {name, role, description} attached when ADD_NODE /
//                      UPDATE_NODE carried command.a11y (p4-4 emission).
//                      Persisted as plugin data on the node so the read
//                      path is selection-driven, not memory-resident.
//
// The new fields ride a feature flag — `selectionSerializerEnabled` in
// `bridge.config.json` — so the legacy {id,name,type,...,boundVariables}
// shape stays byte-equivalent until the flag flips. The flag's authoritative
// default lives in bridge.config.json (false); the plugin sandbox cannot
// read JSON files off disk, so we mirror the default here and let the UI
// shell flip it at runtime via the `set-plugin-flag` message
// (or `globalThis.__HDS_PLUGIN_FLAGS__.selectionSerializerEnabled = true`
// from a debug console).
//
var __HDS_PLUGIN_FLAGS__ = {
  // Mirrors bridge.config.json -> selectionSerializerEnabled (default false).
  selectionSerializerEnabled: false,
};
if (typeof globalThis !== 'undefined') {
  if (!globalThis.__HDS_PLUGIN_FLAGS__) globalThis.__HDS_PLUGIN_FLAGS__ = __HDS_PLUGIN_FLAGS__;
  else __HDS_PLUGIN_FLAGS__ = globalThis.__HDS_PLUGIN_FLAGS__;
}

function isSelectionSerializerEnabled() {
  try {
    var flags = (typeof globalThis !== 'undefined' && globalThis.__HDS_PLUGIN_FLAGS__) || __HDS_PLUGIN_FLAGS__;
    return flags && flags.selectionSerializerEnabled === true;
  } catch (_) {
    return false;
  }
}

// Cache the inverted variable map (Figma variable id → dot-notation token
// path). Populated on first call; the existing streamLoadVariableMap()
// already keys by token path, so we just flip it.
var _selectionVarIdToPath = null;
function getVariableIdToPathMap() {
  if (_selectionVarIdToPath) return _selectionVarIdToPath;
  // streamLoadVariableMap() returns a Promise — we need a sync lookup
  // during selectionchange (Figma plugin API rejects awaits inside the
  // event). Kick a refresh and surface whatever has resolved so far.
  streamLoadVariableMap().then(function(varByTokenPath) {
    var map = {};
    if (varByTokenPath && typeof varByTokenPath === 'object') {
      for (var tokenPath in varByTokenPath) {
        var v = varByTokenPath[tokenPath];
        if (v && v.id) map[v.id] = tokenPath;
      }
    }
    _selectionVarIdToPath = map;
  }).catch(function() { /* surface empty map on failure */ });
  return _selectionVarIdToPath || {};
}

// Resolve a node to its manifest componentSpec key. INSTANCE nodes carry
// `mainComponent` (the linked COMPONENT, possibly inside a COMPONENT_SET);
// COMPONENT / COMPONENT_SET nodes use their own name. The registry is
// case-insensitive and tolerates "Hds" prefix variation; we strip Figma's
// variant suffix ("HdsButton/Variant=primary" → "HdsButton") before
// matching against componentSpecs.
function resolveComponentName(node, manifest) {
  if (!node) return null;
  var rawName = null;
  try {
    if (node.type === 'INSTANCE') {
      var main = node.mainComponent;
      if (main) {
        // COMPONENT inside a COMPONENT_SET → use the parent set's name
        // because manifest specs are keyed by the set, not the variant.
        if (main.parent && main.parent.type === 'COMPONENT_SET') {
          rawName = main.parent.name;
        } else {
          rawName = main.name;
        }
      }
    } else if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      rawName = node.name;
    }
  } catch (_) {
    rawName = null;
  }
  if (!rawName) return null;
  // Strip variant suffix and trim — manifest specs key by the bare name.
  var base = String(rawName).split('/')[0].split('=')[0].trim();
  if (!base) return null;
  // Manifest hit?
  var specs = manifest && manifest.componentSpecs ? manifest.componentSpecs : {};
  if (specs[base]) return base;
  // Case-insensitive fallback against componentInventory.
  var inv = manifest && manifest.componentInventory ? manifest.componentInventory : [];
  var lower = base.toLowerCase();
  for (var i = 0; i < inv.length; i++) {
    if (String(inv[i]).toLowerCase() === lower) return inv[i];
  }
  return null;
}

// Translate boundVariables (Figma's {prop: {type:'VARIABLE_ALIAS', id:'VAR…'}})
// into a flat {prop: 'tier.path.like.this'} object using the local variable
// map. Anything that fails to resolve is omitted — the consumer can still
// see the raw boundVariables field for diagnostics.
function resolveBoundVariablePaths(boundVariables) {
  if (!boundVariables || typeof boundVariables !== 'object') return null;
  var idMap = getVariableIdToPathMap();
  var out = {};
  var any = false;
  for (var key in boundVariables) {
    var entry = boundVariables[key];
    if (!entry) continue;
    // Figma stores either a single alias or an array (e.g. fills[]).
    if (Array.isArray(entry)) {
      var arr = [];
      for (var i = 0; i < entry.length; i++) {
        var aid = entry[i] && entry[i].id;
        var apath = aid && idMap[aid];
        arr.push(apath || null);
      }
      // Only emit if at least one slot resolved.
      var hit = false;
      for (var j = 0; j < arr.length; j++) if (arr[j]) { hit = true; break; }
      if (hit) { out[key] = arr; any = true; }
    } else {
      var id = entry.id;
      var p = id && idMap[id];
      if (p) { out[key] = p; any = true; }
    }
  }
  return any ? out : null;
}

// p4-4 a11y read path. The compiler attaches {name, role, description} to
// emitted commands; ADD_NODE / UPDATE_NODE handlers persist that on the
// node via setPluginData('hdsA11y', JSON.stringify(...)). Selection reads
// it back here. If the node has no a11y plugin data, fall back to the
// componentSpec description so the lint / fix-mode validators always have
// *something* to reason about.
function extractNodeA11y(node, componentName, manifest) {
  var stored = null;
  try {
    var raw = node.getPluginData && node.getPluginData('hdsA11y');
    if (raw) stored = JSON.parse(raw);
  } catch (_) { stored = null; }
  if (stored && typeof stored === 'object') return stored;
  // Manifest description fallback (only when we matched a spec).
  if (componentName && manifest && manifest.componentSpecs && manifest.componentSpecs[componentName]) {
    var spec = manifest.componentSpecs[componentName];
    if (spec && typeof spec.description === 'string' && spec.description.length) {
      return { description: spec.description };
    }
  }
  return null;
}

function extractNodeTree(node, depth, manifest) {
  depth = depth || 0;
  if (!node || depth > 4) return null;
  var result = {
    id: node.id,
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
    x: node.x,
    y: node.y,
  };
  try { if (node.fills) result.fills = JSON.parse(JSON.stringify(node.fills)); } catch (_) {}
  try { if (node.boundVariables && Object.keys(node.boundVariables).length) result.boundVariables = node.boundVariables; } catch (_) {}

  // Manifest-aware enrichments — flag-gated so the legacy shape is preserved
  // byte-for-byte when selectionSerializerEnabled is false.
  if (isSelectionSerializerEnabled()) {
    var componentName = resolveComponentName(node, manifest);
    if (componentName) result.componentName = componentName;
    var tokenPaths = resolveBoundVariablePaths(result.boundVariables);
    if (tokenPaths) result.tokenPaths = tokenPaths;
    var a11y = extractNodeA11y(node, componentName, manifest);
    if (a11y) result.a11y = a11y;
  }

  if (node.children && node.children.length && depth < 4) {
    result.children = [];
    for (var i = 0; i < node.children.length; i++) {
      var child = extractNodeTree(node.children[i], depth + 1, manifest);
      if (child) result.children.push(child);
    }
  }
  return result;
}

// Cached manifest snapshot used by extractNodeTree. selectionchange runs
// frequently, so we hold the last-resolved manifest and refresh it lazily
// in the background. When the flag is off, manifest is never consulted and
// stays null — the hot path skips all I/O.
var _selectionManifest = null;
function refreshSelectionManifest() {
  streamLoadManifest().then(function(m) { if (m) _selectionManifest = m; }).catch(function() {});
}

figma.on('selectionchange', function() {
  // Only warm the manifest + variable cache when the flag is on, so flag-off
  // performance is identical to the legacy code path.
  if (isSelectionSerializerEnabled()) {
    if (!_selectionManifest) refreshSelectionManifest();
    if (!_selectionVarIdToPath) getVariableIdToPathMap();
  }
  var tree = figma.currentPage.selection.map(function(n) {
    return extractNodeTree(n, 0, _selectionManifest);
  }).filter(Boolean);
  figma.ui.postMessage({ type: 'selection-changed', tree: tree });
});

// ── 10f-1: full-page snapshot walker ──────────────────────────────────────
//
// buildFullPageSnapshot() walks the entire Figma document and emits the
// same normalized node shape as p6-1's extractNodeTree(), plus document-
// level envelopes for variables, styles, and component summaries.
//
// Key invariants:
//   * Does NOT re-implement selection traversal — calls extractNodeTree()
//     directly for every top-level frame/component_set on each page.
//   * Variable collection walk re-uses the tokenPath normalization from
//     streamNormalizeVarName() and the tier classification already in
//     streamLoadVariableMap().
//   * Feature-flagged behind `snapshotEnabled` (same __HDS_PLUGIN_FLAGS__
//     channel as selectionSerializerEnabled). Flag off → handler is a
//     no-op that posts { type: 'snapshot-error', error: 'disabled' }.
//
// The plugin posts the snapshot back via:
//   { type: 'snapshot-result', snapshot: <FigmaSnapshot> }
// The UI shell forwards it to POST /plugin-message; the bridge stores it
// in `currentSnapshot` and serves it from GET /snapshot.
//
// Slot bindings: a node may have plugin data under key 'hdsSlot'
// (a JSON string { slot, assetId }). extractNodeTree does not surface
// this today; the snapshot walker layers it on without modifying the
// p6-1 function so the selection path stays byte-equivalent.

function snapshotRgbToHex(rgb) {
  // Figma colour: {r,g,b,a} in [0,1]. Convert to #rrggbbaa (omit alpha if 1).
  function ch(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }
  var hex = '#' + ch(rgb.r) + ch(rgb.g) + ch(rgb.b);
  if (typeof rgb.a === 'number' && rgb.a < 1) hex += ch(rgb.a);
  return hex;
}

function extractSlotBindings(node) {
  try {
    var raw = node.getPluginData && node.getPluginData('hdsSlot');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

// Walk a single page and extract top-level frames using extractNodeTree.
// Returns a PageSummary conforming to figma-snapshot.schema.json.
function snapshotPage(page, manifest) {
  var frames = [];
  try {
    var children = page.children || [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      // Only serialize FRAME and COMPONENT_SET at the top level of a page.
      if (child.type !== 'FRAME' && child.type !== 'COMPONENT_SET') continue;
      var node = extractNodeTree(child, 0, manifest);
      if (!node) continue;
      // Layer slot bindings without modifying extractNodeTree's output contract.
      var slots = extractSlotBindings(child);
      if (slots) node.slotBindings = slots;
      frames.push(node);
    }
  } catch (_) {}
  return { id: page.id, name: page.name, type: 'PAGE', frames: frames };
}

// Walk all variable collections, normalizing the same way as streamLoadVariableMap().
// Returns { 'HDS Primitive': VariableCollection, ... } — only HDS-prefixed collections.
async function snapshotVariables() {
  var out = {};
  try {
    var collections = await figma.variables.getLocalVariableCollectionsAsync();
    var variables  = await figma.variables.getLocalVariablesAsync();

    for (var ci = 0; ci < collections.length; ci++) {
      var coll = collections[ci];
      if (!coll.name || coll.name.indexOf('HDS') !== 0) continue;

      var modes = (coll.modes || []).map(function(m) {
        return { modeId: m.modeId, name: m.name };
      });

      var collVars = [];
      for (var vi = 0; vi < variables.length; vi++) {
        var v = variables[vi];
        if (v.variableCollectionId !== coll.id) continue;

        // Derive token path using the same normalization as streamLoadVariableMap.
        var nameDotted = streamNormalizeVarName(v.name);
        if (!nameDotted) continue;

        var tier = '';
        if (coll.name === 'HDS Primitive') tier = 'primitive';
        else if (coll.name === 'HDS Semantic') tier = 'semantic';
        else if (coll.name === 'HDS Component') tier = 'component';

        var tokenPath = tier ? tier + '.' + nameDotted : nameDotted;

        // Serialize valuesByMode — convert Figma RGB objects to hex strings.
        var valuesByMode = {};
        var rawModes = Object.keys(v.valuesByMode || {});
        for (var mi = 0; mi < rawModes.length; mi++) {
          var modeId = rawModes[mi];
          var val = v.valuesByMode[modeId];
          if (val && typeof val === 'object' && typeof val.r === 'number') {
            valuesByMode[modeId] = snapshotRgbToHex(val);
          } else {
            valuesByMode[modeId] = val;
          }
        }

        var entry = {
          id: v.id,
          name: v.name,
          tokenPath: tokenPath,
          resolvedType: v.resolvedType,
          valuesByMode: valuesByMode,
        };
        if (v.scopes && v.scopes.length) entry.scopes = v.scopes;
        collVars.push(entry);
      }

      out[coll.name] = { id: coll.id, name: coll.name, modes: modes, variables: collVars };
    }
  } catch (_) {}
  return out;
}

// Walk local styles, grouped by kind: paint, text, effect, grid.
async function snapshotStyles() {
  var out = { paint: [], text: [], effect: [], grid: [] };
  try {
    var styleTypes = [
      { method: 'getLocalPaintStyles',  key: 'paint'  },
      { method: 'getLocalTextStyles',   key: 'text'   },
      { method: 'getLocalEffectStyles', key: 'effect' },
      { method: 'getLocalGridStyles',   key: 'grid'   },
    ];
    for (var si = 0; si < styleTypes.length; si++) {
      var st = styleTypes[si];
      try {
        var styles = figma[st.method] ? figma[st.method]() : [];
        for (var i = 0; i < styles.length; i++) {
          var s = styles[i];
          var entry = { id: s.id, name: s.name, type: s.type };
          if (s.description) entry.description = s.description;
          out[st.key].push(entry);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return out;
}

// Walk all local COMPONENT and COMPONENT_SET nodes in the document.
// Returns a flat list of ComponentSummary objects.
function snapshotComponents(manifest) {
  var out = [];
  try {
    var allNodes = figma.root.findAll(function(n) {
      return n.type === 'COMPONENT' || n.type === 'COMPONENT_SET';
    });
    for (var i = 0; i < allNodes.length; i++) {
      var n = allNodes[i];
      var entry = {
        id: n.id,
        name: n.name,
        type: n.type,
        pageId: n.parent ? (findPageId(n) || null) : null,
      };
      var compName = resolveComponentName(n, manifest);
      if (compName) entry.componentName = compName;
      if (n.type === 'COMPONENT_SET') {
        try {
          entry.variants = (n.children || []).map(function(c) { return c.name; });
        } catch (_) { entry.variants = []; }
        try {
          entry.properties = n.componentPropertyDefinitions || {};
        } catch (_) {}
      }
      var a11y = extractNodeA11y(n, compName, manifest);
      if (a11y) entry.a11y = a11y;
      out.push(entry);
    }
  } catch (_) {}
  return out;
}

// Walk up the parent chain to find the enclosing page id.
function findPageId(node) {
  var cur = node;
  while (cur && cur.parent) {
    cur = cur.parent;
    if (cur.type === 'PAGE') return cur.id;
  }
  return null;
}

async function buildFullPageSnapshot() {
  var manifest = _selectionManifest;
  if (!manifest) {
    try { manifest = await streamLoadManifest(); } catch (_) { manifest = null; }
  }

  var pages = [];
  try {
    for (var pi = 0; pi < figma.root.children.length; pi++) {
      pages.push(snapshotPage(figma.root.children[pi], manifest));
    }
  } catch (_) {}

  var variables = await snapshotVariables();
  var styles    = await snapshotStyles();
  var components = snapshotComponents(manifest);

  return {
    snapshotAt:   new Date().toISOString(),
    documentName: (figma.root && figma.root.name) || '',
    pages:        pages,
    variables:    variables,
    styles:       styles,
    components:   components,
  };
}

// ── 10f-7: XPath-like query walker (plugin side) ───────────────────────────
//
// Handles `{ type: 'xpath-query', selector: '//FRAME[@name~=Card]' }` messages
// broadcast from the bridge GET /query endpoint via the SSE plugin-message
// channel. Walks figma.root.findAll() with the predicate, serializes
// matches via extractNodeTree (p6-1), and posts results back via the
// bridge-reply path.
//
// Supported selector grammar (subset only):
//   //TYPE                 — all nodes of that Figma type
//   //TYPE[@attr=value]    — exact match on `attr`
//   //TYPE[@attr~=value]   — substring match on `attr`
//   //TYPE[@attr]          — presence (attr is truthy)
//
// `attr` is always lowercased and matched against node.name, node.id,
// node.type, or any string property of the node. The most common use-case
// is `[@name~=Card]` ("show me every card on this page").
//
// No axes (parent::, ancestor::), no predicates beyond the single-attr
// form above, no functions (contains(), starts-with()). This is
// intentionally minimal — headless inspection helper, not a full XPath engine.

function parseXPathSelector(selector) {
  // Returns { nodeType: string|null, attrName: string|null, op: '='|'~='|null, attrValue: string|null }
  // or null if the selector cannot be parsed.
  var trimmed = (selector || '').trim();
  // Must start with //
  if (trimmed.indexOf('//') !== 0) return null;
  var body = trimmed.slice(2); // e.g. "FRAME[@name~=Card]"

  var attrMatch = body.match(/^([A-Z_]*)(\[([^\]]+)\])?$/);
  if (!attrMatch) return null;

  var nodeType  = attrMatch[1] || null;   // e.g. "FRAME" — empty means any type
  var predicate = attrMatch[3] || null;   // e.g. "@name~=Card"

  var attrName = null, op = null, attrValue = null;
  if (predicate) {
    // Exact match: @attr=value
    var exactMatch = predicate.match(/^@([\w]+)=(.+)$/);
    // Substring match: @attr~=value
    var substringMatch = predicate.match(/^@([\w]+)~=(.+)$/);
    // Presence: @attr
    var presenceMatch = predicate.match(/^@([\w]+)$/);

    if (substringMatch) {
      attrName  = substringMatch[1].toLowerCase();
      op        = '~=';
      attrValue = substringMatch[2];
    } else if (exactMatch) {
      attrName  = exactMatch[1].toLowerCase();
      op        = '=';
      attrValue = exactMatch[2];
    } else if (presenceMatch) {
      attrName  = presenceMatch[1].toLowerCase();
      op        = null;
      attrValue = null;
    } else {
      return null; // unsupported predicate syntax
    }
  }

  return { nodeType: nodeType || null, attrName: attrName, op: op, attrValue: attrValue };
}

function xpathNodeMatches(node, parsed) {
  if (!parsed) return false;
  // Type filter (empty nodeType = any)
  if (parsed.nodeType && node.type !== parsed.nodeType) return false;
  // No predicate = match all of this type
  if (!parsed.attrName) return true;

  // Resolve the attribute value from the node. We check 'name', 'id',
  // 'type', and 'description' as the common inspection targets.
  var nodeVal = null;
  var a = parsed.attrName;
  if (a === 'name')        nodeVal = typeof node.name        === 'string' ? node.name        : null;
  else if (a === 'id')     nodeVal = typeof node.id          === 'string' ? node.id          : null;
  else if (a === 'type')   nodeVal = typeof node.type        === 'string' ? node.type        : null;
  else if (a === 'description') {
    try { nodeVal = typeof node.description === 'string' ? node.description : null; } catch (_) {}
  } else {
    // Attempt generic property access (string-valued only).
    try {
      var v = node[a];
      nodeVal = (typeof v === 'string' || typeof v === 'number') ? String(v) : null;
    } catch (_) {}
  }

  // Presence check (op is null)
  if (parsed.op === null) return nodeVal !== null && nodeVal !== '' && nodeVal !== undefined;

  if (nodeVal === null) return false;
  if (parsed.op === '=')  return nodeVal === parsed.attrValue;
  if (parsed.op === '~=') return nodeVal.indexOf(parsed.attrValue) !== -1;
  return false;
}

async function runXPathQuery(selector, requestId) {
  var manifest = _selectionManifest;
  if (!manifest) {
    try { manifest = await streamLoadManifest(); } catch (_) { manifest = null; }
  }

  var parsed = parseXPathSelector(selector);
  if (!parsed) {
    figma.ui.postMessage({
      type: 'bridge-reply',
      inReplyTo: requestId,
      reply: { ok: false, error: 'invalid selector syntax: ' + selector, nodes: [] },
    });
    return;
  }

  var matches = [];
  try {
    var allNodes = figma.root.findAll(function(n) {
      return xpathNodeMatches(n, parsed);
    });
    for (var i = 0; i < allNodes.length; i++) {
      var serialized = extractNodeTree(allNodes[i], 0, manifest);
      if (serialized) matches.push(serialized);
    }
  } catch (err) {
    figma.ui.postMessage({
      type: 'bridge-reply',
      inReplyTo: requestId,
      reply: { ok: false, error: err.message, nodes: [] },
    });
    return;
  }

  figma.ui.postMessage({
    type: 'bridge-reply',
    inReplyTo: requestId,
    reply: { ok: true, selector: selector, count: matches.length, nodes: matches },
  });
}

figma.ui.onmessage = async (msg) => {
  // p5-3: receive the user's pasted shared secret from the UI prompt
  // and persist it via clientStorage. After this lands, subsequent
  // outbound messages can be HMAC-signed against the bridge's value.
  if (msg && msg.type === 'set-bridge-secret') {
    await persistBridgeSecret(msg.secret);
    return;
  }

  // 12l: runtime override for bridge URL. The UI settings panel
  // posts the new URL here; we persist it via clientStorage so all
  // subsequent sandbox fetch/EventSource calls use the updated value.
  if (msg && msg.type === 'set-bridge-url') {
    await persistBridgeUrl(msg.url);
    return;
  }

  // p6-1: runtime override for plugin-side feature flags. The plugin
  // sandbox can't read bridge.config.json directly, so the UI shell (or
  // a dev console) flips flags via this message. Currently only
  // selectionSerializerEnabled is wired; additional booleans can ride the
  // same channel without schema changes.
  if (msg && msg.type === 'set-plugin-flag') {
    var flagName = msg.flag;
    var flagValue = msg.value === true;
    if (typeof flagName === 'string' && flagName.length) {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.__HDS_PLUGIN_FLAGS__) {
          globalThis.__HDS_PLUGIN_FLAGS__[flagName] = flagValue;
        }
        __HDS_PLUGIN_FLAGS__[flagName] = flagValue;
      } catch (_) { /* sandbox-safe */ }
    }
    return;
  }

  // 10f-1: take-snapshot — walk the full document and post the normalized
  // snapshot back to the bridge. Feature-flagged behind snapshotEnabled.
  // The bridge broadcasts this as a plugin-message of type 'take-snapshot';
  // the UI shell relays it to the sandbox via the SSE plugin-message path.
  if (msg.type === 'take-snapshot') {
    var snapshotEnabled = false;
    try {
      var f = (typeof globalThis !== 'undefined' && globalThis.__HDS_PLUGIN_FLAGS__) || __HDS_PLUGIN_FLAGS__;
      snapshotEnabled = f && f.snapshotEnabled === true;
    } catch (_) {}
    if (!snapshotEnabled) {
      figma.ui.postMessage({
        type: 'bridge-reply',
        inReplyTo: msg.requestId || null,
        reply: { ok: false, error: 'snapshotEnabled flag is off', snapshot: null },
      });
      return;
    }
    try {
      var snap = await buildFullPageSnapshot();
      figma.ui.postMessage({
        type: 'bridge-reply',
        inReplyTo: msg.requestId || null,
        reply: { ok: true, snapshot: snap },
      });
    } catch (err) {
      figma.ui.postMessage({
        type: 'bridge-reply',
        inReplyTo: msg.requestId || null,
        reply: { ok: false, error: err.message, snapshot: null },
      });
    }
    return;
  }

  // 10f-7: xpath-query — run an XPath-like selector against the full
  // document and return matching nodes serialized via p6-1 extractNodeTree.
  // The bridge broadcasts this as a plugin-message of type 'xpath-query'.
  if (msg.type === 'xpath-query') {
    await runXPathQuery(msg.selector || '', msg.requestId || null);
    return;
  }

  if (msg.type === 'llm-stream-node') {
    const payload = msg.payload || {};
    const command = payload.command || payload;
    if (command && command.action === 'ADD_NODE') {
      try {
        await streamLoadVariableMap();
        await streamRenderAddNode(command);
      } catch (err) {
        console.log('[llm-stream] ADD_NODE failed: ' + err.message);
      }
      return;
    }

    if (command && command.action === 'UPDATE_NODE') {
      const nodeId = command.id;
      const props = command.props || {};
      try {
        const node = figma.getNodeById(nodeId);
        if (!node) {
          console.log('[UPDATE_NODE] Node not found: ' + nodeId);
          return;
        }
        const [manifest] = await Promise.all([streamLoadManifest(), streamLoadVariableMap()]);
        if (node.type === 'TEXT') {
          await streamApplyTextProps(node, props, manifest);
        } else if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
          streamApplyFrameProps(node, props, manifest);
        }
        // p6-1: refresh a11y plugin data on UPDATE_NODE too — the compiler
        // re-emits a11y on every command, so an edit to aria-label flows
        // through to the canvas without a full rebuild.
        persistA11yPluginData(node, command && command.a11y);
        figma.notify('✨ Updated: ' + (node.name || nodeId));
      } catch (err) {
        console.log('[UPDATE_NODE] failed: ' + err.message);
      }
      return;
    }

    return;
  }

  if (msg.type === 'SYNC_TOKENS') {
    try {
      let manifest = msg.manifest;
      if (!manifest) {
        const res = await fetch(getBridgeUrl() + '/get-manifest');
        if (!res.ok) throw new Error('bridge /get-manifest returned ' + res.status);
        manifest = await res.json();
      }

      const engine = await loadSyncEngine();
      const report = await engine.runSync(manifest);

      // Bust the cached variable map so subsequent renderers see fresh ids.
      streamVariableMapPromise = null;

      const s = report.summary;
      figma.notify(
        '✨ Tokens synced — ' + s.created + ' created, ' + s.updated + ' updated, ' +
        s.errors + ' error' + (s.errors === 1 ? '' : 's')
      );
      figma.ui.postMessage({ type: 'sync-tokens-complete', report });
    } catch (err) {
      console.error('[SYNC_TOKENS]', err);
      figma.notify('❌ Sync failed: ' + err.message);
      figma.ui.postMessage({ type: 'sync-tokens-error', error: err.message });
    }
    return;
  }

  if (msg.type === 'pull-to-codebase') {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const primitiveCollection = collections.find(c => c.name === "HDS Primitive");
    if (!primitiveCollection) return figma.notify("❌ Collection not found.");
    
    const variables = await figma.variables.getLocalVariablesAsync();
    const myVars = variables.filter(v => v.variableCollectionId === primitiveCollection.id);
    const modeId = primitiveCollection.modes[0].modeId;

    const tokensForManifest = myVars.map(v => {
      const val = v.valuesByMode[modeId];
      let finalValue = val;
      if (val && typeof val === 'object' && val.r !== undefined) finalValue = rgbToHex(val);

      return {
        path: `primitive.color.${v.name.replace(/-/g, '.')}`,
        name: v.name,
        value: finalValue,
        type: v.resolvedType === "COLOR" ? "color" : "dimension"
      };
    });
    figma.ui.postMessage({ type: 'push-data', data: tokensForManifest });
  }

  if (msg.type === 'render-trigger') {
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      try { 
        await figma.loadFontAsync({ family: "Atkinson Hyperlegible Next", style: "Bold" }); 
        await figma.loadFontAsync({ family: "Atkinson Hyperlegible Next", style: "Regular" }); 
      } catch(e) { console.log("Falling back to Inter."); }

      const res = await fetch(getBridgeUrl() + '/get-manifest');
      const manifest = await res.json();

      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      let primColl = collections.find(c => c.name === "HDS Primitive") || figma.variables.createVariableCollection("HDS Primitive");
      let semColl = collections.find(c => c.name === "HDS Semantic") || figma.variables.createVariableCollection("HDS Semantic");
      const primMode = primColl.modes[0].modeId;
      const semMode = semColl.modes[0].modeId;

      const primMap = {};
      const allVars = await figma.variables.getLocalVariablesAsync();

      for (const t of manifest.tokens.primitive) {
        // Manifest tokens from hirobius.tokens.json have no `name` field — derive one
        // from the path so Figma variable names are stable and round-trippable.
        const tVarName = t.name ? t.name : t.path.split('.').slice(1).join('-');
        let v = allVars.find(x => x.name === tVarName && x.variableCollectionId === primColl.id);
        if (t.type === 'color') {
          if (!v) v = figma.variables.createVariable(tVarName, primColl.id, "COLOR");
          if (t.value.startsWith('#')) v.setValueForMode(primMode, hexToRgb(t.value));
          primMap[t.path] = v;
        } else if (t.type === 'dimension' || t.type === 'number') {
          if (!v) v = figma.variables.createVariable(tVarName, primColl.id, "FLOAT");
          const numVal = parseFloat(t.value);
          if (!isNaN(numVal)) v.setValueForMode(primMode, numVal);
          primMap[t.path] = v;
        }
      }

      for (const t of manifest.tokens.semantic) {
        // slice(1) keeps the type segment in the name (e.g. "color-action-bg-primary",
        // "space-px16") so the draw-component indexer can reconstruct the full
        // "semantic.color.action.bg.primary" path without ambiguity.
        const cleanName = t.path.split('.').slice(1).join('-');
        let v = allVars.find(x => x.name === cleanName && x.variableCollectionId === semColl.id);
        if (t.type === 'color') {
          if (!v) v = figma.variables.createVariable(cleanName, semColl.id, "COLOR");
        } else if (t.type === 'dimension' || t.type === 'number') {
          if (!v) v = figma.variables.createVariable(cleanName, semColl.id, "FLOAT");
        } else { continue; }
        if (t.alias && t.alias.startsWith('{')) {
          const path = t.alias.replace('{', '').replace('}', '');
          const targetVar = primMap[path];
          if (targetVar) v.setValueForMode(semMode, { type: 'VARIABLE_ALIAS', id: targetVar.id });
        }
      }

      let page = figma.root.children.find(p => p.name === "🎨 HDS: Foundations");
      if (!page) { page = figma.createPage(); page.name = "🎨 HDS: Foundations"; }
      figma.currentPage = page;
      page.children.forEach(c => c.remove()); 

      const main = figma.createFrame();
      main.name = "HDS Foundations Specimen";
      main.layoutMode = "VERTICAL";
      main.resize(1200, 100); 
      main.counterAxisSizingMode = "FIXED"; 
      main.primaryAxisSizingMode = "AUTO"; 
      main.itemSpacing = 80;
      main.paddingTop = 100; main.paddingBottom = 100;
      main.paddingLeft = 80; main.paddingRight = 80;
      main.fills = [{type: 'SOLID', color: {r: 0.98, g: 0.98, b: 0.98}}];

      const drawTable = (title, tokens) => {
        if (!tokens || tokens.length === 0) return null;
        const group = figma.createFrame();
        group.name = title;
        group.layoutMode = "VERTICAL";
        group.layoutAlign = "STRETCH"; 
        group.itemSpacing = 8;
        group.fills = [];

        const header = figma.createText();
        header.characters = title.toUpperCase();
        header.fontName = { family: "Inter", style: "Bold" };
        header.fontSize = 18;
        group.appendChild(header);

        tokens.forEach(t => {
          const row = figma.createFrame();
          row.layoutMode = "HORIZONTAL";
          row.layoutAlign = "STRETCH";
          row.itemSpacing = 16;
          row.paddingTop = 12; row.paddingBottom = 12;
          row.paddingLeft = 16; row.paddingRight = 16;
          row.fills = [{type: 'SOLID', color: {r: 0.94, g: 0.94, b: 0.94}}];
          row.cornerRadius = 4;

          const name = figma.createText();
          name.characters = t.name || t.path.split('.').pop() || "unknown";
          name.fontName = { family: "Inter", style: "Bold" };
          
          const valText = t.value || t.alias || JSON.stringify(t.composite) || "N/A";
          const val = figma.createText();
          val.characters = valText;
          val.fontName = { family: "Inter", style: "Regular" };

          row.appendChild(name);
          row.appendChild(val);
          name.layoutGrow = 1;
          val.layoutGrow = 1;
          val.textAutoResize = "HEIGHT";

          group.appendChild(row);
        });
        return group;
      };

      const primHeader = figma.createText();
      primHeader.characters = "TIER 1: PRIMITIVE TOKENS";
      primHeader.fontName = { family: "Inter", style: "Bold" };
      primHeader.fontSize = 32;
      main.appendChild(primHeader);

      const colorGroup = figma.createFrame();
      colorGroup.name = "Colors";
      colorGroup.layoutMode = "VERTICAL";
      colorGroup.layoutAlign = "STRETCH";
      colorGroup.itemSpacing = 32;
      colorGroup.fills = [];
      
      const ramps = {};
      Object.values(primMap).forEach(v => {
        if(v.resolvedType !== "COLOR") return;
        const family = v.name.split('-')[0];
        if (!ramps[family]) ramps[family] = [];
        ramps[family].push(v);
      });

      for (const [family, vars] of Object.entries(ramps)) {
        const rampFrame = figma.createFrame();
        rampFrame.name = `${family.toUpperCase()} RAMP`;
        rampFrame.layoutMode = "HORIZONTAL";
        rampFrame.layoutWrap = "WRAP"; 
        rampFrame.layoutAlign = "STRETCH"; 
        rampFrame.counterAxisSpacing = 16; 
        rampFrame.itemSpacing = 16;
        rampFrame.fills = [];
        vars.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

        vars.forEach(v => {
          const card = figma.createFrame();
          card.layoutMode = "VERTICAL";
          card.itemSpacing = 8;
          card.paddingTop = 12; card.paddingBottom = 12;
          card.paddingLeft = 12; card.paddingRight = 12;
          card.cornerRadius = 8;
          card.fills = [{type: 'SOLID', color: {r: 1, g: 1, b: 1}}];
          
          const box = figma.createRectangle();
          box.resize(80, 80);
          box.cornerRadius = 4;
          box.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: {r: 0, g: 0, b: 0} }, 'color', v)];
          
          const label = figma.createText();
          label.characters = v.name;
          label.fontName = { family: "Inter", style: "Bold" };
          label.fontSize = 12;

          card.appendChild(box);
          card.appendChild(label);
          rampFrame.appendChild(card);
        });
        colorGroup.appendChild(rampFrame);
      }
      main.appendChild(colorGroup);

      const primTypes = {};
      manifest.tokens.primitive.filter(t => t.type !== 'color').forEach(t => {
          if(!primTypes[t.type]) primTypes[t.type] = [];
          primTypes[t.type].push(t);
      });
      for (const [type, tokens] of Object.entries(primTypes)) {
          const table = drawTable(`Primitive: ${type}`, tokens);
          if (table) main.appendChild(table);
      }

      const divider = figma.createRectangle();
      divider.resize(1040, 2);
      divider.fills = [{type: 'SOLID', color: {r: 0.9, g: 0.9, b: 0.9}}];
      main.appendChild(divider);

      const semHeader = figma.createText();
      semHeader.characters = "TIER 2: SEMANTIC TOKENS";
      semHeader.fontName = { family: "Inter", style: "Bold" };
      semHeader.fontSize = 32;
      main.appendChild(semHeader);

      const semTypes = {};
      manifest.tokens.semantic.forEach(t => {
          if(!semTypes[t.type]) semTypes[t.type] = [];
          semTypes[t.type].push(t);
      });

      for (const [type, tokens] of Object.entries(semTypes)) {
          const title = type === 'color' ? "Semantic: color (Aliases)" : `Semantic: ${type}`;
          const table = drawTable(title, tokens);
          if (table) main.appendChild(table);
      }

      figma.notify("✨ Entire Token Library Rendered!");
      figma.ui.postMessage({ type: 'render-complete' });
    } catch(err) {
      console.error(err);
      figma.notify("❌ Render Error: " + err.message);
      figma.ui.postMessage({ type: 'render-complete' }); 
    }
  }

  // --- STEP 4: SCAFFOLD COMPONENTS ---
  if (msg.type === 'scaffold-components') {
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });

      const res = await fetch(getBridgeUrl() + '/get-manifest');
      const manifest = await res.json();

      let page = figma.root.children.find(p => p.name === "🧩 HDS: Components");
      if (!page) { page = figma.createPage(); page.name = "🧩 HDS: Components"; }
      figma.currentPage = page;
      page.children.forEach(c => c.remove());

      const main = figma.createFrame();
      main.name = "Component Architecture Matrix";
      main.layoutMode = "VERTICAL";
      
      main.resize(1200, 100); 
      main.counterAxisSizingMode = "FIXED"; 
      main.primaryAxisSizingMode = "AUTO"; 
      
      main.itemSpacing = 80;
      main.paddingTop = 100; main.paddingBottom = 100;
      main.paddingLeft = 80; main.paddingRight = 80;
      main.fills = [{type: 'SOLID', color: {r: 0.98, g: 0.98, b: 0.98}}];

      const specs = manifest.componentSpecs || {};
      const categories = {};
      Object.entries(specs).forEach(([name, data]) => {
         const cat = data.category || "Uncategorized";
         if(!categories[cat]) categories[cat] = [];
         categories[cat].push(Object.assign({ name: name }, data));
      });

      for (const [catName, comps] of Object.entries(categories)) {
         const section = figma.createFrame();
         section.name = catName;
         section.layoutMode = "VERTICAL";
         section.layoutAlign = "STRETCH"; 
         section.itemSpacing = 32;
         section.fills = [];

         const header = figma.createText();
         header.characters = catName.toUpperCase();
         header.fontName = { family: "Inter", style: "Bold" };
         header.fontSize = 32;
         section.appendChild(header);

         const grid = figma.createFrame();
         grid.name = "Grid";
         grid.layoutMode = "HORIZONTAL";
         grid.layoutWrap = "WRAP";
         grid.layoutAlign = "STRETCH";
         grid.itemSpacing = 24;
         grid.counterAxisSpacing = 24;
         grid.fills = [];

         comps.forEach(c => {
            const block = figma.createFrame();
            block.name = c.name;
            block.layoutMode = "VERTICAL";
            block.itemSpacing = 16;
            block.paddingTop = 24; block.paddingBottom = 24;
            block.paddingLeft = 24; block.paddingRight = 24;
            
            block.resize(300, 10); 
            block.counterAxisSizingMode = "FIXED"; 
            block.primaryAxisSizingMode = "AUTO";  
            
            block.fills = [{type: 'SOLID', color: {r: 1, g: 1, b: 1}}];
            block.cornerRadius = 8;
            block.strokes = [{type: 'SOLID', color: {r: 0.8, g: 0.8, b: 0.8}}];
            block.dashPattern = [4, 4];

            const title = figma.createText();
            title.characters = c.name;
            title.fontName = { family: "Inter", style: "Bold" };
            title.fontSize = 18;

            const desc = figma.createText();
            desc.characters = c.description || "No description provided.";
            desc.fontName = { family: "Inter", style: "Regular" };
            desc.fontSize = 12;
            desc.fills = [{type: 'SOLID', color: {r: 0.4, g: 0.4, b: 0.4}}];
            
            block.appendChild(title);
            block.appendChild(desc);
            desc.layoutAlign = "STRETCH"; 
            desc.textAutoResize = "HEIGHT";

            grid.appendChild(block);
         });
         section.appendChild(grid);
         main.appendChild(section);
      }
      
      figma.notify("🧩 Component Architecture Scaffolded!");
      figma.ui.postMessage({ type: 'render-complete' });
    } catch(err) {
      console.error(err);
      figma.notify("❌ Scaffold Error: " + err.message);
      figma.ui.postMessage({ type: 'render-complete' });
    }
  }

  // ── STEP 5: DRAW COMPONENT FROM CODE ──────────────────────────────────────
  if (msg.type === 'draw-component') {
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      try {
        await figma.loadFontAsync({ family: "Atkinson Hyperlegible Next", style: "Regular" });
        await figma.loadFontAsync({ family: "Atkinson Hyperlegible Next", style: "Bold" });
      } catch(_) { }

      const allVars     = await figma.variables.getLocalVariablesAsync();
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const primColl    = collections.find(c => c.name === 'HDS Primitive');

      const varByTokenPath = {};
      if (primColl) {
        for (const v of allVars.filter(v => v.variableCollectionId === primColl.id)) {
          const nameDotted = streamNormalizeVarName(v.name);
          if (!nameDotted) continue;
          if (v.resolvedType === 'COLOR') {
            const key = nameDotted.indexOf('color.') === 0
              ? `primitive.${nameDotted}`
              : `primitive.color.${nameDotted}`;
            varByTokenPath[key] = v;
          } else if (v.resolvedType === 'FLOAT') {
            varByTokenPath[`primitive.${nameDotted}`] = v;
          }
        }
      }

      // Index semantic variables so token paths from the interceptor resolve to
      // themeable aliases. Variable name "color-surface-page" → path "semantic.color.surface.page".
      const semColl = collections.find(c => c.name === 'HDS Semantic');
      if (semColl) {
        for (const v of allVars.filter(v => v.variableCollectionId === semColl.id)) {
          const nameDotted = streamNormalizeVarName(v.name);
          if (!nameDotted) continue;
          if (v.resolvedType === 'COLOR' || v.resolvedType === 'FLOAT') {
            varByTokenPath[`semantic.${nameDotted}`] = v;
          }
        }
      }

      // Index component-level variables when a "HDS Component" collection exists.
      // Variable name "button-paddingX" → path "component.button.paddingX".
      // This collection is created in a later render step; the lookup is a no-op until then.
      const compColl = collections.find(c => c.name === 'HDS Component');
      if (compColl) {
        for (const cv of allVars.filter(v => v.variableCollectionId === compColl.id)) {
          const nameDotted = streamNormalizeVarName(cv.name);
          if (!nameDotted) continue;
          varByTokenPath[`component.${nameDotted}`] = cv;
        }
      }

      console.log('Registered Variables:', Object.keys(varByTokenPath));

      // Diagnostic: log all FLOAT variable paths to surface dimension binding failures.
      // If an expected path (e.g. "semantic.space.px16") is missing here, the variable
      // was not created by render-trigger or its name derivation does not match.
      const floatDiagKeys = [];
      for (const diagK in varByTokenPath) {
        if (varByTokenPath[diagK] && varByTokenPath[diagK].resolvedType === 'FLOAT') {
          floatDiagKeys.push(diagK);
        }
      }
      console.log('[HDS varByTokenPath] ' + floatDiagKeys.length + ' FLOAT variable(s): ' + floatDiagKeys.join(' | '));

      const manifest = await streamLoadManifest();

      function resolveWithBinding(paints, tokenPath) {
        if (!tokenPath || !varByTokenPath[tokenPath] || !(paints && paints.length)) return paints;
        const targetVar = varByTokenPath[tokenPath];
        return paints.map(p => p.type === 'SOLID'
          ? figma.variables.setBoundVariableForPaint(p, 'color', targetVar)
          : p);
      }

      // ── Utilities ──────────────────────────────────────────────────────────

      function clamp01(v) { return Math.max(0, Math.min(1, v)); }

      // Builder outputs lineHeight as {unit:"PIXELS",value:N} or undefined.
      // Handles the number form defensively too.
      function safeLineHeight(lh) {
        if (lh == null) return { unit: 'AUTO' };
        if (typeof lh === 'number') return { value: Math.max(0, lh), unit: 'PIXELS' };
        if (typeof lh === 'object' && typeof lh.value === 'number' && lh.unit)
          return { value: Math.max(0, lh.value), unit: lh.unit };
        return { unit: 'AUTO' };
      }

      // Builder outputs letterSpacing as {unit:"PIXELS",value:N} — NOT a raw number.
      // The old code wrapped it again, producing {value:{…},unit:'PIXELS'} — crash.
      function safeLetterSpacing(ls) {
        if (ls == null) return null;
        if (typeof ls === 'number') return { value: ls, unit: 'PIXELS' };
        if (typeof ls === 'object' && typeof ls.value === 'number')
          return { value: ls.value, unit: ls.unit || 'PIXELS' };
        return null;
      }

      // Strip IMAGE fills (imageHash:null crashes Figma). Keep only valid SOLIDs.
      function cleanSolidFills(raw) {
        if (!Array.isArray(raw) || !raw.length) return [];
        return raw
          .filter(f => f && f.type === 'SOLID' && f.color &&
                       typeof f.color.r === 'number' &&
                       typeof f.color.g === 'number' &&
                       typeof f.color.b === 'number')
          .map(f => ({
            type: 'SOLID',
            visible: true,
            opacity: clamp01(typeof f.opacity === 'number' ? f.opacity : 1),
            color: {
              r: clamp01(f.color.r),
              g: clamp01(f.color.g),
              b: clamp01(f.color.b),
            },
          }));
      }

      // Builder shadow: {type:"DROP_SHADOW", color:{r,g,b,a}, offset:{x,y}, radius, blendMode, visible}
      function cleanEffects(raw) {
        if (!Array.isArray(raw) || !raw.length) return [];
        return raw
          .filter(e => e && e.type === 'DROP_SHADOW' && e.color &&
                       typeof e.color.r === 'number' &&
                       e.offset && typeof e.offset.x === 'number')
          .map(e => ({
            type: 'DROP_SHADOW',
            visible: e.visible !== false,
            blendMode: e.blendMode || 'NORMAL',
            color: {
              r: clamp01(e.color.r),
              g: clamp01(e.color.g),
              b: clamp01(e.color.b),
              a: clamp01(typeof e.color.a === 'number' ? e.color.a : 1),
            },
            offset: { x: e.offset.x || 0, y: e.offset.y || 0 },
            radius: Math.max(0, e.radius || 0),
            spread: e.spread || 0,
          }));
      }

      // Builder emits topLeftRadius/topRightRadius/bottomRightRadius/bottomLeftRadius
      // (individual corners), not always a uniform cornerRadius.
      function applyCornerRadius(node, data) {
        const hasIndividual =
          typeof data.topLeftRadius     === 'number' ||
          typeof data.topRightRadius    === 'number' ||
          typeof data.bottomRightRadius === 'number' ||
          typeof data.bottomLeftRadius  === 'number';
        if (hasIndividual) {
          try {
            node.topLeftRadius     = Math.max(0, data.topLeftRadius     || 0);
            node.topRightRadius    = Math.max(0, data.topRightRadius    || 0);
            node.bottomRightRadius = Math.max(0, data.bottomRightRadius || 0);
            node.bottomLeftRadius  = Math.max(0, data.bottomLeftRadius  || 0);
          } catch(_) {
            if (typeof data.cornerRadius === 'number')
              try { node.cornerRadius = Math.max(0, data.cornerRadius); } catch(_) {}
          }
        } else if (typeof data.cornerRadius === 'number') {
          try { node.cornerRadius = Math.max(0, data.cornerRadius); } catch(_) {}
        }
      }

      // ── Font resolution ────────────────────────────────────────────────────

      const _loadedFonts = new Set(['Inter::Regular', 'Inter::Bold']);
      async function ensureFont(family, style) {
        const key = `${family}::${style}`;
        if (_loadedFonts.has(key)) return true;
        try { await figma.loadFontAsync({ family, style }); _loadedFonts.add(key); return true; }
        catch(_) { return false; }
      }

      // Builder gives a raw CSS font-family string, e.g. '"Atkinson Hyperlegible Next", Inter, sans-serif'
      function parseFontFamily(raw) {
        if (!raw) return 'Inter';
        return raw.split(',')[0].trim().replace(/['"]/g, '') || 'Inter';
      }

      async function resolveFont(fontFamily, fontWeight) {
        const family  = parseFontFamily(fontFamily);
        const wantBold = (typeof fontWeight === 'number' ? fontWeight : 400) >= 600;
        const primary  = wantBold ? 'Bold' : 'Regular';
        const fallback = wantBold ? 'Regular' : 'Bold';
        if (await ensureFont(family, primary))  return { family, style: primary };
        if (await ensureFont(family, fallback)) return { family, style: fallback };
        return { family: 'Inter', style: primary };
      }

      // ── Node builder ───────────────────────────────────────────────────────

      const VALID_ALIGN = new Set(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']);
      const VALID_CASE  = new Set(['UPPER', 'LOWER', 'TITLE', 'ORIGINAL', 'SMALL_CAPS', 'SMALL_CAPS_FORCED']);
      const VALID_DECO  = new Set(['NONE', 'UNDERLINE', 'STRIKETHROUGH']);

      async function buildNode(data, parent, isRoot) {
        if (!data || typeof data !== 'object') return null;

        // ── TEXT ────────────────────────────────────────────────────────────
        if (data.type === 'TEXT') {
          const node = figma.createText();
          node.name = data.name || 'Text';

          const fontName = await resolveFont(data.fontFamily, data.fontWeight);
          try { node.fontName = fontName; }
          catch(_) { node.fontName = { family: 'Inter', style: 'Regular' }; }

          if (typeof data.fontSize === 'number' && data.fontSize > 0)
            node.fontSize = data.fontSize;

          try { node.lineHeight = safeLineHeight(data.lineHeight); } catch(_) {}

          const ls = safeLetterSpacing(data.letterSpacing);
          if (ls) { try { node.letterSpacing = ls; } catch(_) {} }

          if (data.textCase && VALID_CASE.has(data.textCase))
            try { node.textCase = data.textCase; } catch(_) {}

          if (data.textDecoration && VALID_DECO.has(data.textDecoration))
            try { node.textDecoration = data.textDecoration; } catch(_) {}

          // characters must be set after fontName
          node.characters = (typeof data.characters === 'string'
            ? data.characters : '').replace(/\s+/g, ' ') || ' ';

          if (data.textAlignHorizontal && VALID_ALIGN.has(data.textAlignHorizontal))
            try { node.textAlignHorizontal = data.textAlignHorizontal; } catch(_) {}

          // Allow the text to auto-size; the parent auto-layout frame will constrain it.
          try { node.textAutoResize = 'WIDTH_AND_HEIGHT'; } catch(_) {}

          streamApplyGeometry(node, data, manifest);

          if (typeof data.opacity === 'number') node.opacity = clamp01(data.opacity);

          const fills = cleanSolidFills(data.fills);
          if (fills.length) {
            try { node.fills = resolveWithBinding(fills, data._hdsTokenBinding && data._hdsTokenBinding.fill); }
            catch(_) { try { node.fills = fills; } catch(_) {} }
          }

          if (typeof data.visible === 'boolean') { try { node.visible = data.visible; } catch(_) {} }

          parent.appendChild(node);
          return node;
        }

        // ── RECTANGLE / VECTOR ──────────────────────────────────────────────
        if (data.type === 'RECTANGLE' || data.type === 'VECTOR') {
          const node = figma.createRectangle();
          node.name = data.name || 'Rect';
          node.resize(Math.max(data.width || 1, 1), Math.max(data.height || 1, 1));

          const fills = cleanSolidFills(data.fills);
          if (fills.length) {
            try { node.fills = resolveWithBinding(fills, data._hdsTokenBinding && data._hdsTokenBinding.fill); }
            catch(_) { try { node.fills = fills; } catch(_) {} }
          } else {
            node.fills = [];
          }

          const strokes = cleanSolidFills(data.strokes);
          if (strokes.length) {
            try { node.strokes = resolveWithBinding(strokes, data._hdsTokenBinding && data._hdsTokenBinding.stroke); }
            catch(_) { try { node.strokes = strokes; } catch(_) {} }
            if (typeof data.strokeWeight === 'number')
              try { node.strokeWeight = Math.max(0, data.strokeWeight); } catch(_) {}
          }

          applyCornerRadius(node, data);

          const effects = cleanEffects(data.effects);
          if (effects.length) { try { node.effects = effects; } catch(_) {} }

          if (typeof data.opacity === 'number') node.opacity = clamp01(data.opacity);

          if (typeof data.visible === 'boolean') { try { node.visible = data.visible; } catch(_) {} }

          parent.appendChild(node);
          return node;
        }

        // ── SVG ─────────────────────────────────────────────────────────────
        if (data.type === 'SVG') {
          try {
            const node = figma.createNodeFromSvg(
              data.svg || '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
            );
            node.name = data.name || 'SVG';
            if (typeof data.width === 'number' && data.width > 0 &&
                typeof data.height === 'number' && data.height > 0) {
              node.resize(data.width, data.height);
            }
            if (typeof data.visible === 'boolean') { try { node.visible = data.visible; } catch(_) {} }
            parent.appendChild(node);
            return node;
          } catch(_) { return null; }
        }

        // ── FRAME (default) ─────────────────────────────────────────────────
        const node = isRoot ? figma.createComponent() : figma.createFrame();
        node.name = data.name || data.type || 'Frame';
        node.resize(Math.max(data.width || 100, 1), Math.max(data.height || 100, 1));
        streamApplyGeometry(node, data, manifest);

        const wantsLayout = data.layoutMode && data.layoutMode !== 'NONE';
        const hasLayoutSpacing = (data.paddingLeft  || 0) > 0 || (data.paddingRight  || 0) > 0 ||
                                 (data.paddingTop   || 0) > 0 || (data.paddingBottom || 0) > 0 ||
                                 (data.itemSpacing  || 0) > 0;
        const layoutMode = wantsLayout ? data.layoutMode : 'HORIZONTAL';
        const primaryAlign = data.primaryAxisAlignItems || 'CENTER';
        const counterAlign = data.counterAxisAlignItems || 'CENTER';
        const primarySizing = data.primaryAxisSizingMode || 'AUTO';
        const counterSizing = data.counterAxisSizingMode || 'AUTO';

        // Root components should preserve the builder's declared layout when it exists.
        // Fall back to a horizontal auto-layout shell only when no layout signal was
        // captured, so single-row controls still hug content instead of stacking children
        // at (0,0). This keeps vertical masters like cards and text stacks intact.
        if (isRoot) {
          node.layoutMode            = layoutMode;
          node.primaryAxisAlignItems = primaryAlign;
          node.counterAxisAlignItems = counterAlign;
          node.primaryAxisSizingMode = primarySizing;
          node.counterAxisSizingMode = counterSizing;
          node.paddingLeft           = Math.max(0, data.paddingLeft   || 0);
          node.paddingRight          = Math.max(0, data.paddingRight  || 0);
          node.paddingTop            = Math.max(0, data.paddingTop    || 0);
          node.paddingBottom         = Math.max(0, data.paddingBottom || 0);
          node.itemSpacing           = Math.max(0, data.itemSpacing   || 0);
        } else {
          // Non-root frames: only enable auto-layout when the extracted data signals it.
          if (wantsLayout || hasLayoutSpacing) {
            node.layoutMode            = layoutMode;
            node.primaryAxisAlignItems = primaryAlign;
            node.counterAxisAlignItems = counterAlign;
            node.paddingLeft           = Math.max(0, data.paddingLeft   || 0);
            node.paddingRight          = Math.max(0, data.paddingRight  || 0);
            node.paddingTop            = Math.max(0, data.paddingTop    || 0);
            node.paddingBottom         = Math.max(0, data.paddingBottom || 0);
            node.itemSpacing           = Math.max(0, data.itemSpacing   || 0);
            node.counterAxisSizingMode = counterSizing;
            node.primaryAxisSizingMode = primarySizing;
          }
        }

        // ── Dimension variable bindings ──────────────────────────────────────
        // Raw value is set explicitly before setBoundVariable — Figma requires the
        // property to carry a concrete number before a variable can be bound to it.
        // A high-visibility warning is emitted when Builder emits 0 or omits a prop.
        const layoutBinding = data._hdsTokenBinding;
        if (layoutBinding) {
          const dimLayoutProps = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'itemSpacing'];
          for (let di = 0; di < dimLayoutProps.length; di++) {
            const dimProp      = dimLayoutProps[di];
            const dimTokenPath = layoutBinding[dimProp];
            if (dimTokenPath) {
              const rawDimVal = typeof data[dimProp] === 'number' ? data[dimProp] : 0;
              if (rawDimVal === 0) {
                console.log('[HDS WARN] ⚠️  ' + dimProp + ' raw value is 0/missing — Builder may not have captured this CSS property. Binding will show 0 in Figma.');
              }
              console.log('[HDS dim] Attempting ' + dimProp + ' -> ' + dimTokenPath + ' (raw=' + rawDimVal + ')');
              try { node[dimProp] = rawDimVal; } catch(_) {}
              if (varByTokenPath[dimTokenPath]) {
                try {
                  node.setBoundVariable(dimProp, varByTokenPath[dimTokenPath]);
                  console.log('[HDS dim] OK Bound ' + dimProp);
                } catch(bindErr) {
                  console.log('[HDS dim] FAIL ' + dimProp + ': ' + bindErr.message);
                }
              } else {
                console.log('[HDS dim] FAIL No variable found for: ' + dimTokenPath);
              }
            }
          }
        }

        // ── cornerRadius: combined raw-set + variable binding ────────────────
        // applyCornerRadius may put the node into independent-corner mode, which
        // blocks uniform cornerRadius binding. When a token binding exists, force
        // uniform mode first (setting node.cornerRadius to the resolved raw value),
        // then bind. Fall back to applyCornerRadius only when no binding is present.
        const crBindingPath = layoutBinding && layoutBinding.cornerRadius;
        if (crBindingPath) {
          let crRaw = 0;
          if (typeof data.cornerRadius === 'number') {
            crRaw = Math.max(0, data.cornerRadius);
          } else {
            const tl = typeof data.topLeftRadius === 'number' ? data.topLeftRadius : 0;
            const tr = typeof data.topRightRadius === 'number' ? data.topRightRadius : 0;
            const br = typeof data.bottomRightRadius === 'number' ? data.bottomRightRadius : 0;
            const bl = typeof data.bottomLeftRadius === 'number' ? data.bottomLeftRadius : 0;
            if (tl === tr && tr === br && br === bl) crRaw = Math.max(0, tl);
          }
          if (crRaw === 0) {
            console.log('[HDS WARN] ⚠️  cornerRadius raw value is 0/missing — Builder may not have captured border-radius.');
          }
          console.log('[HDS dim] Attempting cornerRadius -> ' + crBindingPath + ' (raw=' + crRaw + ')');
          try { node.cornerRadius = crRaw; } catch(_) {}
          if (varByTokenPath[crBindingPath]) {
            try {
              node.setBoundVariable('cornerRadius', varByTokenPath[crBindingPath]);
              console.log('[HDS dim] OK Bound cornerRadius');
            } catch(bindErr) {
              console.log('[HDS dim] FAIL cornerRadius: ' + bindErr.message);
              applyCornerRadius(node, data);
            }
          } else {
            console.log('[HDS dim] FAIL No variable found for: ' + crBindingPath);
            applyCornerRadius(node, data);
          }
        } else {
          applyCornerRadius(node, data);
        }

        if (typeof data.opacity === 'number')      node.opacity      = clamp01(data.opacity);
        if (typeof data.clipsContent === 'boolean') node.clipsContent = data.clipsContent;

        // Builder uses 'fills' for explicit frame backgrounds; 'backgrounds' is always [].
        const fills = cleanSolidFills(data.fills);
        if (fills.length) {
          try { node.fills = resolveWithBinding(fills, data._hdsTokenBinding && data._hdsTokenBinding.fill); }
          catch(_) { try { node.fills = fills; } catch(_) {} }
        } else {
          node.fills = [];
        }

        const strokes = cleanSolidFills(data.strokes);
        if (strokes.length) {
          try { node.strokes = resolveWithBinding(strokes, data._hdsTokenBinding && data._hdsTokenBinding.stroke); }
          catch(_) { try { node.strokes = strokes; } catch(_) {} }
          if (typeof data.strokeWeight === 'number')
            try { node.strokeWeight = Math.max(0, data.strokeWeight); } catch(_) {}
        }

        const effects = cleanEffects(data.effects);
        if (effects.length) { try { node.effects = effects; } catch(_) {} }

        if (typeof data.visible === 'boolean') { try { node.visible = data.visible; } catch(_) {} }

        parent.appendChild(node);

        try {
          for (const child of (data.children || [])) {
            await buildNode(child, node);
          }
        } catch (childErr) {
          try { node.remove(); } catch(_) {}
          throw childErr;
        }
        return node;
      }

      // ── DOM Artifact Scrubber ────────────────────────────────────────────────
      // Lifts fills, strokes, and cornerRadius from the background RECTANGLE onto
      // the parent frame, then removes it. Works with both fixed and auto-layout frames.
      //
      // For auto-layout frames: the frame may have resized away from its original CSS
      // size, so size-matching is unreliable. Instead, the first RECTANGLE child with
      // fills or strokes is treated as the background rect (z-order heuristic).
      // Auto-layout properties are snapshotted before the lift and re-asserted after
      // removal so that no padding or alignment is accidentally lost.
      function scrubArtifacts(node) {
        var children = node.children;
        if (children && children.length) {
          var snapshot = [];
          for (var i = 0; i < children.length; i++) { snapshot.push(children[i]); }
          for (var j = 0; j < snapshot.length; j++) { scrubArtifacts(snapshot[j]); }
        }

        var isFrameLike = node.type === 'FRAME' || node.type === 'COMPONENT';
        if (!isFrameLike) return;
        if (!node.children || node.children.length === 0) return;

        // Snapshot auto-layout state before touching anything so we can re-assert it.
        var hasAutoLayout = node.layoutMode && node.layoutMode !== 'NONE';
        var savedLayout = hasAutoLayout ? {
          layoutMode:            node.layoutMode,
          primaryAxisAlignItems: node.primaryAxisAlignItems,
          counterAxisAlignItems: node.counterAxisAlignItems,
          primaryAxisSizingMode: node.primaryAxisSizingMode,
          counterAxisSizingMode: node.counterAxisSizingMode,
          paddingLeft:           node.paddingLeft,
          paddingRight:          node.paddingRight,
          paddingTop:            node.paddingTop,
          paddingBottom:         node.paddingBottom,
          itemSpacing:           node.itemSpacing,
        } : null;

        var bgRect = null;
        for (var k = 0; k < node.children.length; k++) {
          var candidate = node.children[k];
          if (candidate.type !== 'RECTANGLE') continue;
          var hasFills   = candidate.fills   && candidate.fills.length   > 0;
          var hasStrokes = candidate.strokes && candidate.strokes.length > 0;
          if (!(hasFills || hasStrokes)) continue;

          if (hasAutoLayout) {
            // With auto-layout the frame has resized; use z-order instead of size matching.
            if (k === 0) { bgRect = candidate; break; }
          } else {
            var widthMatch  = Math.abs(candidate.width  - node.width)  <= 2;
            var heightMatch = Math.abs(candidate.height - node.height) <= 2;
            if (widthMatch && heightMatch) { bgRect = candidate; break; }
          }
        }
        if (!bgRect) return;

        // Lift fills (paint objects carry inline boundVariables from setBoundVariableForPaint)
        var rectFills = bgRect.fills;
        if (rectFills && rectFills.length) {
          try { node.fills = rectFills; } catch(_) {}
        }

        // Lift strokes
        var rectStrokes = bgRect.strokes;
        if (rectStrokes && rectStrokes.length) {
          try { node.strokes = rectStrokes; } catch(_) {}
          if (typeof bgRect.strokeWeight === 'number') {
            try { node.strokeWeight = bgRect.strokeWeight; } catch(_) {}
          }
        }

        // Lift cornerRadius — prefer per-corner values when present
        var hasIndividual =
          typeof bgRect.topLeftRadius     === 'number' ||
          typeof bgRect.topRightRadius    === 'number' ||
          typeof bgRect.bottomRightRadius === 'number' ||
          typeof bgRect.bottomLeftRadius  === 'number';

        if (hasIndividual) {
          try {
            node.topLeftRadius     = Math.max(0, bgRect.topLeftRadius     || 0);
            node.topRightRadius    = Math.max(0, bgRect.topRightRadius    || 0);
            node.bottomRightRadius = Math.max(0, bgRect.bottomRightRadius || 0);
            node.bottomLeftRadius  = Math.max(0, bgRect.bottomLeftRadius  || 0);
          } catch(_) {
            if (typeof bgRect.cornerRadius === 'number') {
              try { node.cornerRadius = Math.max(0, bgRect.cornerRadius); } catch(_) {}
            }
          }
        } else if (typeof bgRect.cornerRadius === 'number') {
          try { node.cornerRadius = Math.max(0, bgRect.cornerRadius); } catch(_) {}
        }

        // Lift any variable binding on cornerRadius
        var bv = bgRect.boundVariables;
        if (bv && bv.cornerRadius && bv.cornerRadius.id) {
          try {
            var crVar = figma.variables.getVariableById(bv.cornerRadius.id);
            if (crVar) { node.setBoundVariable('cornerRadius', crVar); }
          } catch(_) {}
        }

        bgRect.remove();

        // Defensively re-assert auto-layout after removal. Removing a child triggers
        // a relayout pass; these properties should persist, but we re-apply to be safe.
        if (savedLayout) {
          try { node.layoutMode            = savedLayout.layoutMode;            } catch(_) {}
          try { node.primaryAxisAlignItems = savedLayout.primaryAxisAlignItems; } catch(_) {}
          try { node.counterAxisAlignItems = savedLayout.counterAxisAlignItems; } catch(_) {}
          try { node.primaryAxisSizingMode = savedLayout.primaryAxisSizingMode; } catch(_) {}
          try { node.counterAxisSizingMode = savedLayout.counterAxisSizingMode; } catch(_) {}
          try { node.paddingLeft           = savedLayout.paddingLeft;           } catch(_) {}
          try { node.paddingRight          = savedLayout.paddingRight;          } catch(_) {}
          try { node.paddingTop            = savedLayout.paddingTop;            } catch(_) {}
          try { node.paddingBottom         = savedLayout.paddingBottom;         } catch(_) {}
          try { node.itemSpacing           = savedLayout.itemSpacing;           } catch(_) {}
        }
      }

      // ── Execute ─────────────────────────────────────────────────────────────

      function positionStateNodes(nodes, gap) {
        let xCursor = 0;
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].x = xCursor;
          xCursor += nodes[i].width + gap;
        }
      }

      // ── Batch path: generate full-library sticker sheet ──────────────────────
      if (msg.batch && Array.isArray(msg.batch) && msg.batch.length > 0) {
        let ssPage = figma.root.children.find(p => p.name === '🗂️ HDS: Sticker Sheet');
        if (!ssPage) { ssPage = figma.createPage(); ssPage.name = '🗂️ HDS: Sticker Sheet'; }
        figma.currentPage = ssPage;
        [...ssPage.children].forEach(c => c.remove());

        const SHEET_COLS          = 4;
        const SHEET_GAP_X         = 200;
        const SHEET_GAP_Y         = 120;
        const SHEET_LABEL_SIZE    = 14;
        const SHEET_LABEL_H       = SHEET_LABEL_SIZE + 8;
        const SHEET_LABEL_GAP     = 12;

        const sheetItems = [];

        for (let bi = 0; bi < msg.batch.length; bi++) {
          const bItem   = msg.batch[bi];
          const bName   = bItem.component || ('Component_' + bi);
          const bStates = bItem.states;

          if (!bStates || !Array.isArray(bStates) || bStates.length === 0) continue;

          const builtNodes = [];
          const STATE_GAP = 64;
          try {
            for (let si = 0; si < bStates.length; si++) {
              const stateNode = await buildNode(bStates[si].tree, ssPage, true);
              if (!stateNode) continue;
              // Composite variant names (e.g. "Variant=primary, Size=md, State=hover")
              // pass through as-is so figma.combineAsVariants() can infer multiple
              // property axes. Single-axis legacy names get the State= prefix.
              const rawState = bStates[si].state;
              stateNode.name = (typeof rawState === 'string' && rawState.indexOf('=') !== -1)
                ? rawState
                : ('State=' + rawState);
              scrubArtifacts(stateNode);
              builtNodes.push(stateNode);
            }
          } catch (buildErr) {
            console.log('[HDS batch] Error building ' + bName + ': ' + buildErr.message);
            for (const n of builtNodes) { try { n.remove(); } catch(_) {} }
            continue;
          }

          if (builtNodes.length === 0) continue;

          positionStateNodes(builtNodes, STATE_GAP);

          let rootNode;
          if (builtNodes.length === 1) {
            rootNode = builtNodes[0];
            rootNode.name = bName;
          } else {
            rootNode = figma.combineAsVariants(builtNodes, ssPage);
            rootNode.name = bName;
          }

          // ── Component properties ──────────────────────────────────────────
          // The batch builder emits componentProperties[] derived from the
          // manifest. Apply them via master.addComponentProperty() (works on
          // both COMPONENT and COMPONENT_SET). Then walk every variant and
          // bind each property reference to a child node identified by name.
          const propDefs = Array.isArray(bItem.componentProperties) ? bItem.componentProperties : [];
          if (propDefs.length && typeof rootNode.addComponentProperty === 'function') {
            const propKeys = {};
            for (let pi = 0; pi < propDefs.length; pi++) {
              const def = propDefs[pi];
              if (!def || !def.name || !def.type) continue;
              try {
                propKeys[def.name] = rootNode.addComponentProperty(def.name, def.type, def.defaultValue);
              } catch (propErr) {
                console.log('[HDS batch] addComponentProperty failed for "' + def.name + '" on ' + bName + ': ' + propErr.message);
              }
            }

            // Wire references: each prop attaches to a node whose `name` matches
            // def.targetSelector. boundTo defaults — TEXT->characters,
            // BOOLEAN->visible, INSTANCE_SWAP->mainComponent.
            const variants = (rootNode.type === 'COMPONENT_SET' && rootNode.children)
              ? rootNode.children
              : [rootNode];
            for (let vi = 0; vi < variants.length; vi++) {
              const variant = variants[vi];
              for (let pi = 0; pi < propDefs.length; pi++) {
                const def = propDefs[pi];
                const key = propKeys[def.name];
                if (!key || !def.targetSelector) continue;
                const refKey = def.boundTo
                  || (def.type === 'TEXT' ? 'characters'
                    : def.type === 'BOOLEAN' ? 'visible'
                    : def.type === 'INSTANCE_SWAP' ? 'mainComponent'
                    : null);
                if (!refKey) continue;
                const targets = (variant.findAll
                  ? variant.findAll(function (n) { return n.name === def.targetSelector; })
                  : []) || [];
                for (let ti = 0; ti < targets.length; ti++) {
                  try {
                    targets[ti].componentPropertyReferences = Object.assign(
                      {},
                      targets[ti].componentPropertyReferences || {},
                      (function () { var o = {}; o[refKey] = key; return o; })()
                    );
                  } catch (refErr) {
                    console.log('[HDS batch] componentPropertyReferences failed for "' + def.name + '"->' + def.targetSelector + ' on ' + bName + ': ' + refErr.message);
                  }
                }
              }
            }
          }

          const labelNode        = figma.createText();
          labelNode.characters   = bName;
          labelNode.fontName     = { family: 'Inter', style: 'Bold' };
          labelNode.fontSize     = SHEET_LABEL_SIZE;
          ssPage.appendChild(labelNode);

          sheetItems.push({ rootNode, labelNode });
        }

        // Compute per-column max widths and per-row max heights for grid layout
        const colWidths  = new Array(SHEET_COLS).fill(0);
        const numRows    = Math.ceil(sheetItems.length / SHEET_COLS);
        const rowHeights = new Array(numRows).fill(0);
        for (let i = 0; i < sheetItems.length; i++) {
          const col = i % SHEET_COLS;
          const row = Math.floor(i / SHEET_COLS);
          colWidths[col]  = Math.max(colWidths[col],  sheetItems[i].rootNode.width);
          rowHeights[row] = Math.max(rowHeights[row], sheetItems[i].rootNode.height);
        }

        // Column x start positions
        const colXStarts = [];
        let cxAcc = 0;
        for (let c = 0; c < SHEET_COLS; c++) {
          colXStarts.push(cxAcc);
          cxAcc += colWidths[c] + SHEET_GAP_X;
        }

        // Row y start positions — each row header is label height + gap above the set
        const rowYStarts = [];
        let ryAcc = 0;
        for (let r = 0; r < numRows; r++) {
          rowYStarts.push(ryAcc);
          ryAcc += SHEET_LABEL_H + SHEET_LABEL_GAP + rowHeights[r] + SHEET_GAP_Y;
        }

        // Position every item
        for (let i = 0; i < sheetItems.length; i++) {
          const col  = i % SHEET_COLS;
          const row  = Math.floor(i / SHEET_COLS);
          sheetItems[i].rootNode.x  = colXStarts[col];
          sheetItems[i].rootNode.y  = rowYStarts[row] + SHEET_LABEL_H + SHEET_LABEL_GAP;
          sheetItems[i].labelNode.x = colXStarts[col];
          sheetItems[i].labelNode.y = rowYStarts[row];
        }

        if (sheetItems.length > 0) figma.viewport.scrollAndZoomIntoView([sheetItems[0].rootNode]);
        figma.notify('🗂️ Sticker sheet: ' + sheetItems.length + ' components drawn!');
        figma.ui.postMessage({ type: 'draw-complete', component: 'Sticker Sheet (' + sheetItems.length + ' components)' });
        return;
      }

      let sandboxPage = figma.root.children.find(p => p.name === '🔲 HDS: Sandbox');
      if (!sandboxPage) {
        sandboxPage = figma.createPage();
        sandboxPage.name = '🔲 HDS: Sandbox';
      }
      figma.currentPage = sandboxPage;

      const componentName = msg.component || 'Component';
      const msgStates     = msg.states;

      // ── Multi-state path: build a Component Set from state array ─────────────
      if (msgStates && Array.isArray(msgStates) && msgStates.length > 0) {
        const builtNodes = [];
        for (let si = 0; si < msgStates.length; si++) {
          const stateObj  = msgStates[si];
          const stateNode = await buildNode(stateObj.tree, sandboxPage, true);
          if (!stateNode) {
            console.log('[HDS states] State "' + stateObj.state + '" produced no node — skipping.');
            continue;
          }
          // Composite variant names (containing '=') pass through as-is so
          // figma.combineAsVariants() can infer multiple property axes.
          stateNode.name = (typeof stateObj.state === 'string' && stateObj.state.indexOf('=') !== -1)
            ? stateObj.state
            : ('State=' + stateObj.state);
          scrubArtifacts(stateNode);
          builtNodes.push(stateNode);
        }

        if (builtNodes.length === 0) {
          figma.notify('❌ draw-component: no state nodes were produced.');
          figma.ui.postMessage({ type: 'draw-complete' });
          return;
        }

        positionStateNodes(builtNodes, 64);

        let resultNode;
        if (builtNodes.length === 1) {
          resultNode = builtNodes[0];
          resultNode.name = componentName;
          figma.notify('✨ ' + componentName + ' component drawn!');
        } else {
          resultNode = figma.combineAsVariants(builtNodes, figma.currentPage);
          resultNode.name = componentName;
          figma.notify('✨ ' + componentName + ' Component Set drawn (' + builtNodes.length + ' variants)!');
        }
        figma.currentPage.selection = [resultNode];
        figma.viewport.scrollAndZoomIntoView([resultNode]);
        figma.ui.postMessage({ type: 'draw-complete', component: componentName });

      // ── Legacy single-tree path ──────────────────────────────────────────────
      } else {
        const rootNode = await buildNode(msg.tree, sandboxPage, true);
        if (rootNode) { scrubArtifacts(rootNode); }

        if (!rootNode) {
          figma.notify('❌ draw-component: tree produced no root node.');
          figma.ui.postMessage({ type: 'draw-complete' });
          return;
        }

        rootNode.name = componentName + (msg.variant ? ' / ' + msg.variant : '');
        figma.currentPage.selection = [rootNode];
        figma.viewport.scrollAndZoomIntoView([rootNode]);

        const bindCount = msg.bindingCount || 0;
        figma.notify('✨ ' + rootNode.name + ' drawn' + (bindCount ? ' with ' + bindCount + ' token binding(s)' : '') + '!');
        figma.ui.postMessage({ type: 'draw-complete', component: rootNode.name });
      }

    } catch(err) {
      console.error('[draw-component]', err);
      // p5-4: emit a render-error back to the bridge so the retry loop's
      // runtime-error path observes the failure. The bridge silently
      // drops these when `runtimeErrorsEnabled` is off, so the flag-off
      // wire behavior matches pre-p5-4. We only attempt routing when the
      // inbound message carried an envelope id (i.e. came from a
      // correlated /plugin-message dispatch). Without an id there is
      // nothing for the bridge to correlate against.
      try {
        if (msg && typeof msg.id === 'string' && msg.id.length > 0) {
          sendRenderError(msg.id, classifyRenderError(err), sanitizeErrorMessage(err));
        }
      } catch (_routeErr) {
        // Never let render-error routing crash the handler — the
        // primary failure (err) has already been notified to the user.
      }
      figma.notify('❌ Draw error: ' + sanitizeErrorMessage(err));
      figma.ui.postMessage({ type: 'draw-complete' });
    }
  }

  // Re-index the component registry after masters are created so the next generation
  // resolves to real components instead of placeholder frames.
  if (msg.type === 'refresh-registry') {
    indexHdsComponents();
    figma.notify('🔄 Registry refreshed: ' + hdsComponentRegistry.size + ' component(s) indexed');
    figma.ui.postMessage({ type: 'registry-refreshed', count: hdsComponentRegistry.size });
  }

  // ── 12h-3: inject-template ────────────────────────────────────────────────
  //
  // Creates a 1440-wide page-layout frame on the current page. Sections are
  // stacked vertically as white rectangles with a gray stroke and a centered
  // text label. Heights: Hero=480px, Footer=120px, all others=240px.
  //
  // The message is broadcast from the bridge's POST /inject-template endpoint
  // via the SSE plugin-message channel so it lands here from the UI shell.
  if (msg.type === 'inject-template') {
    try {
      var SECTION_HEIGHTS = { hero: 480, section: 240, footer: 120 };
      var FRAME_WIDTH_TI = 1440;

      var spec = msg.templateSpec;
      if (!spec || !spec.sections || !Array.isArray(spec.sections)) {
        figma.notify('❌ Template inject: missing or invalid templateSpec');
        figma.ui.postMessage({ type: 'template-inject-error', error: 'missing templateSpec' });
        return;
      }

      // Create outer frame
      var tiFrame = figma.createFrame();
      tiFrame.name = spec.name || msg.template || 'Layout';
      tiFrame.resize(FRAME_WIDTH_TI, 900); // will be updated below

      var tiYOffset = 0;
      var tiFontLoaded = false;

      for (var tiSi = 0; tiSi < spec.sections.length; tiSi++) {
        var tiSection = spec.sections[tiSi];
        var tiSectionName = tiSection.name || ('Section ' + (tiSi + 1));
        var tiHeightType = tiSection.height || 'section';
        var tiSectionHeight = SECTION_HEIGHTS[tiHeightType] || SECTION_HEIGHTS.section;

        // Section rectangle — white fill, light gray stroke
        var tiRect = figma.createRectangle();
        tiRect.name = tiSectionName;
        tiRect.resize(FRAME_WIDTH_TI, tiSectionHeight);
        tiRect.x = 0;
        tiRect.y = tiYOffset;
        tiRect.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        tiRect.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        tiRect.strokeWeight = 1;
        tiFrame.appendChild(tiRect);

        // Centered text label
        try {
          if (!tiFontLoaded) {
            await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
            tiFontLoaded = true;
          }
          var tiLabel = figma.createText();
          tiLabel.name = tiSectionName + ' Label';
          tiLabel.characters = tiSectionName;
          tiLabel.fontSize = 24;
          tiLabel.fills = [{ type: 'SOLID', color: { r: 0.45, g: 0.45, b: 0.45 } }];
          // Center within the section rect
          tiLabel.x = Math.round((FRAME_WIDTH_TI - tiLabel.width) / 2);
          tiLabel.y = tiYOffset + Math.round((tiSectionHeight - tiLabel.height) / 2);
          tiFrame.appendChild(tiLabel);
        } catch (fontErr) {
          console.log('[inject-template] font load failed for section ' + tiSectionName + ': ' + fontErr.message);
        }

        tiYOffset += tiSectionHeight;
      }

      // Resize frame to total height
      tiFrame.resize(FRAME_WIDTH_TI, tiYOffset);

      // Move frame into view
      figma.viewport.scrollAndZoomIntoView([tiFrame]);

      figma.notify('✅ ' + tiFrame.name + ' — ' + spec.sections.length + ' sections');
      figma.ui.postMessage({ type: 'template-inject-complete', templateName: tiFrame.name, frameId: tiFrame.id });
    } catch (tiErr) {
      figma.notify('❌ Template inject failed: ' + sanitizeErrorMessage(tiErr));
      figma.ui.postMessage({ type: 'template-inject-error', error: sanitizeErrorMessage(tiErr) });
    }
  }

  // ── 12h-4: build-status-sync ──────────────────────────────────────────────
  //
  // Renders a build-status frame on the '🔄 Build Status' page (creates the
  // page if absent). The frame has a summary block and per-phase progress bars
  // using colored rectangles (HDS feedback token colors).
  //
  // HDS color references:
  //   feedback.success  → #047857 (green.700)
  //   feedback.warning  → #92400e (amber.800)
  //   neutral.400       → #a3a3a3
  //   neutral.800       → #262626
  if (msg.type === 'build-status-sync') {
    try {
      var STATUS_FRAME_NAME = 'Build Status';
      var STATUS_PAGE_NAME = '🔄 Build Status';
      var BS_FRAME_WIDTH = 800;
      var BS_PADDING = 32;
      var BS_ROW_HEIGHT = 28;
      var BS_BAR_MAX_WIDTH = 400;
      var BS_BAR_HEIGHT = 8;

      // Colors (HDS semantic token values)
      var BS_COLOR_DONE    = { r: 0.016, g: 0.471, b: 0.341 };  // #047857 feedback.success
      var BS_COLOR_ACTIVE  = { r: 0.573, g: 0.251, b: 0.055 };  // #92400e feedback.warning
      var BS_COLOR_TEXT    = { r: 0.149, g: 0.149, b: 0.149 };  // #262626 neutral.800
      var BS_COLOR_SUBTEXT = { r: 0.639, g: 0.639, b: 0.639 };  // #a3a3a3 neutral.400
      var BS_COLOR_BG_BAR  = { r: 0.898, g: 0.898, b: 0.898 };  // #e5e5e5 neutral.200
      var BS_COLOR_WHITE   = { r: 1, g: 1, b: 1 };

      // Locate or create the status page
      var bsPage = null;
      for (var bsPi = 0; bsPi < figma.root.children.length; bsPi++) {
        if (figma.root.children[bsPi].name === STATUS_PAGE_NAME) {
          bsPage = figma.root.children[bsPi];
          break;
        }
      }
      if (!bsPage) {
        bsPage = figma.createPage();
        bsPage.name = STATUS_PAGE_NAME;
      }

      // Remove any existing status frame so we start fresh
      for (var bsCi = bsPage.children.length - 1; bsCi >= 0; bsCi--) {
        if (bsPage.children[bsCi].name === STATUS_FRAME_NAME) {
          bsPage.children[bsCi].remove();
          break;
        }
      }

      // Calculate total frame height
      var bsPhases = msg.phases || [];
      var bsTotalHeight = BS_PADDING * 2 + 120 + bsPhases.length * (BS_ROW_HEIGHT + 6);

      // Create outer frame
      var bsFrame = figma.createFrame();
      bsFrame.name = STATUS_FRAME_NAME;
      bsFrame.resize(BS_FRAME_WIDTH, bsTotalHeight);
      bsFrame.fills = [{ type: 'SOLID', color: BS_COLOR_WHITE }];
      bsPage.appendChild(bsFrame);

      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
      } catch (bsFontErr) {
        console.log('[build-status-sync] font load failed: ' + bsFontErr.message);
      }

      var bsY = BS_PADDING;

      // Title
      var bsTitle = figma.createText();
      bsTitle.name = 'Title';
      bsTitle.fontName = { family: 'Inter', style: 'Bold' };
      bsTitle.fontSize = 24;
      bsTitle.characters = 'HDS Build Status';
      bsTitle.fills = [{ type: 'SOLID', color: BS_COLOR_TEXT }];
      bsTitle.x = BS_PADDING;
      bsTitle.y = bsY;
      bsFrame.appendChild(bsTitle);
      bsY += 36;

      // Subtitle / total
      var bsSub = figma.createText();
      bsSub.name = 'Subtitle';
      bsSub.fontSize = 13;
      bsSub.characters = (msg.totalUnits || 0) + ' total units — ' + (msg.done || 0) + ' done, ' + (msg.inProgress || 0) + ' active, ' + (msg.pending || 0) + ' pending';
      bsSub.fills = [{ type: 'SOLID', color: BS_COLOR_SUBTEXT }];
      bsSub.x = BS_PADDING;
      bsSub.y = bsY;
      bsFrame.appendChild(bsSub);
      bsY += 24;

      // Overall progress bar
      var bsOverallPct = msg.totalUnits > 0 ? (msg.done || 0) / msg.totalUnits : 0;
      var bsBgBar = figma.createRectangle();
      bsBgBar.name = 'Overall Bar BG';
      bsBgBar.resize(BS_FRAME_WIDTH - BS_PADDING * 2, BS_BAR_HEIGHT * 2);
      bsBgBar.x = BS_PADDING;
      bsBgBar.y = bsY;
      bsBgBar.fills = [{ type: 'SOLID', color: BS_COLOR_BG_BAR }];
      bsBgBar.cornerRadius = 4;
      bsFrame.appendChild(bsBgBar);

      if (bsOverallPct > 0) {
        var bsFillBar = figma.createRectangle();
        bsFillBar.name = 'Overall Bar Fill';
        bsFillBar.resize(Math.max(4, Math.round((BS_FRAME_WIDTH - BS_PADDING * 2) * bsOverallPct)), BS_BAR_HEIGHT * 2);
        bsFillBar.x = BS_PADDING;
        bsFillBar.y = bsY;
        bsFillBar.fills = [{ type: 'SOLID', color: BS_COLOR_DONE }];
        bsFillBar.cornerRadius = 4;
        bsFrame.appendChild(bsFillBar);
      }
      bsY += BS_BAR_HEIGHT * 2 + 16;

      // Divider
      var bsDivider = figma.createRectangle();
      bsDivider.name = 'Divider';
      bsDivider.resize(BS_FRAME_WIDTH - BS_PADDING * 2, 1);
      bsDivider.x = BS_PADDING;
      bsDivider.y = bsY;
      bsDivider.fills = [{ type: 'SOLID', color: BS_COLOR_BG_BAR }];
      bsFrame.appendChild(bsDivider);
      bsY += 16;

      // Phase rows
      for (var bsPhi = 0; bsPhi < bsPhases.length; bsPhi++) {
        var bsPh = bsPhases[bsPhi];
        var bsPhPct = bsPh.total > 0 ? bsPh.done / bsPh.total : 0;

        // Phase label
        var bsPhLabel = figma.createText();
        bsPhLabel.name = 'Phase ' + bsPh.phase;
        bsPhLabel.fontSize = 11;
        bsPhLabel.characters = String(bsPh.phase);
        bsPhLabel.fills = [{ type: 'SOLID', color: BS_COLOR_SUBTEXT }];
        bsPhLabel.x = BS_PADDING;
        bsPhLabel.y = bsY + Math.round((BS_ROW_HEIGHT - bsPhLabel.height) / 2);
        bsFrame.appendChild(bsPhLabel);

        // Progress bar background
        var bsRowBg = figma.createRectangle();
        bsRowBg.name = 'Phase ' + bsPh.phase + ' BG';
        bsRowBg.resize(BS_BAR_MAX_WIDTH, BS_BAR_HEIGHT);
        bsRowBg.x = BS_PADDING + 160;
        bsRowBg.y = bsY + Math.round((BS_ROW_HEIGHT - BS_BAR_HEIGHT) / 2);
        bsRowBg.fills = [{ type: 'SOLID', color: BS_COLOR_BG_BAR }];
        bsRowBg.cornerRadius = 3;
        bsFrame.appendChild(bsRowBg);

        // Progress bar fill
        if (bsPhPct > 0) {
          var bsRowFill = figma.createRectangle();
          bsRowFill.name = 'Phase ' + bsPh.phase + ' Fill';
          bsRowFill.resize(Math.max(4, Math.round(BS_BAR_MAX_WIDTH * bsPhPct)), BS_BAR_HEIGHT);
          bsRowFill.x = BS_PADDING + 160;
          bsRowFill.y = bsY + Math.round((BS_ROW_HEIGHT - BS_BAR_HEIGHT) / 2);
          bsRowFill.fills = [{ type: 'SOLID', color: BS_COLOR_DONE }];
          bsRowFill.cornerRadius = 3;
          bsFrame.appendChild(bsRowFill);
        }

        // Count label
        var bsCountLabel = figma.createText();
        bsCountLabel.name = 'Phase ' + bsPh.phase + ' Count';
        bsCountLabel.fontSize = 10;
        bsCountLabel.characters = bsPh.done + '/' + bsPh.total;
        bsCountLabel.fills = [{ type: 'SOLID', color: BS_COLOR_SUBTEXT }];
        bsCountLabel.x = BS_PADDING + 160 + BS_BAR_MAX_WIDTH + 12;
        bsCountLabel.y = bsY + Math.round((BS_ROW_HEIGHT - bsCountLabel.height) / 2);
        bsFrame.appendChild(bsCountLabel);

        bsY += BS_ROW_HEIGHT + 6;
      }

      // Scroll into view on the status page
      figma.currentPage = bsPage;
      figma.viewport.scrollAndZoomIntoView([bsFrame]);

      figma.notify('✅ Build status frame updated');
      figma.ui.postMessage({ type: 'build-status-frame-rendered', page: STATUS_PAGE_NAME });
    } catch (bsErr) {
      figma.notify('❌ Status sync failed: ' + sanitizeErrorMessage(bsErr));
    }
  }
};
