/** @internal — not part of @hirobius/design-system public API surface. */
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import {
  resolvePendingRequest,
  snapshotPending,
  readCorrelationFlag,
  readRuntimeErrorsFlag,
  handleRenderError,
  REQUEST_TTL_MS,
  PENDING_LIMIT,
  _pendingRequestsSize,
} from './correlation.mjs';
import { createAuthMiddleware, readAuthFlag } from './auth-middleware.mjs';

// 12h-2: --check-config mode. When invoked with this flag the bridge reads
// bridge.config.json, validates every required boolean flag is present and
// correctly typed, and exits 0 (OK) or 1 (FAIL). No server is started.
// This is the validationCmd for units 12h-2 and 12h-3 and MUST run before
// the auth-guard below so a missing HDS_BRIDGE_SECRET does not mask config
// problems.
if (process.argv.includes('--check-config')) {
  (function runCheckConfig() {
    const BRIDGE_CONFIG_PATH = path.join(process.cwd(), 'bridge.config.json');
    const issues = [];

    let cfg;
    try {
      cfg = JSON.parse(fs.readFileSync(BRIDGE_CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.error(`[hds-bridge --check-config] FAIL: cannot read/parse bridge.config.json — ${err.message}`);
      process.exit(1);
    }

    // Required boolean flags — all must be present and boolean-typed.
    const REQUIRED_BOOL_FLAGS = [
      'gatekeeperEnabled',
      'retryLoopEnabled',
      'selectionSerializerEnabled',
      'authEnabled',
      'lintEnabled',
      'contrastEnabled',
      'correlationEnabled',
      'runtimeErrorsEnabled',
      'reverseTokenSyncEnabled',
      'snapshotEnabled',
      'xpathQueryEnabled',
      'pairEnabled',
    ];

    for (const flag of REQUIRED_BOOL_FLAGS) {
      if (!(flag in cfg)) {
        issues.push(`missing required flag: ${flag}`);
      } else if (typeof cfg[flag] !== 'boolean') {
        issues.push(`flag ${flag} must be boolean, got ${typeof cfg[flag]}`);
      }
    }

    // flagAudit must be an object if present
    if ('flagAudit' in cfg && (cfg.flagAudit === null || typeof cfg.flagAudit !== 'object' || Array.isArray(cfg.flagAudit))) {
      issues.push('flagAudit must be an object');
    }

    if (issues.length > 0) {
      console.error('[hds-bridge --check-config] FAIL:');
      for (const issue of issues) {
        console.error('  - ' + issue);
      }
      process.exit(1);
    }

    console.log('[hds-bridge --check-config] OK — bridge.config.json is valid');
    process.exit(0);
  })();
}

// p5-3: HMAC auth. When `authEnabled` is true the bridge requires every
// inbound POST /plugin-message to carry a valid envelope + matching
// Authorization: HMAC <hex> header signed with HDS_BRIDGE_SECRET. There
// is NO hardcoded default secret; the bridge refuses to start with the
// flag on and the env var unset. When the flag is off the middleware is
// a strict pass-through and bridge behavior is byte-equivalent to
// pre-p5-3.
const AUTH_ENABLED_AT_BOOT = readAuthFlag();
const HDS_BRIDGE_SECRET = process.env.HDS_BRIDGE_SECRET;
if (AUTH_ENABLED_AT_BOOT && (!HDS_BRIDGE_SECRET || HDS_BRIDGE_SECRET.length === 0)) {
  console.error(
    '[hds-bridge] FATAL: authEnabled=true in bridge.config.json but ' +
    'HDS_BRIDGE_SECRET environment variable is unset. Refusing to start. ' +
    'Set the env var or flip authEnabled back to false.'
  );
  process.exit(1);
}

const app = express();
// Port is overridable via HDS_BRIDGE_PORT for smoke tests / parallel sessions.
// Default 3005 matches the plugin's hardcoded URL (figma-agent-plugin/manifest.json
// allowedDomains + ui.html). Production / dev: leave unset. Smoke-only override:
// HDS_BRIDGE_PORT=3105.
const PORT = Number(process.env.HDS_BRIDGE_PORT || 3005);

app.use(cors());

const clients = new Set();
let sequence = 0;
let currentSelection = null;

// p5-2: request/response correlation lives in scripts/correlation.mjs.
// The bridge calls into it from /plugin-message (resolve) and /pending-ids
// (snapshot). When `correlationEnabled` is false, those branches no-op
// and the wire behavior matches pre-p5-2.

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastEvent(event, body) {
  const payload = {
    sequence: ++sequence,
    receivedAt: new Date().toISOString(),
    ...body,
  };

  for (const client of clients) {
    sendEvent(client, event, payload);
  }

  return payload;
}

function broadcast(command) {
  return broadcastEvent('node', { command });
}

function broadcastPluginMessage(message) {
  return broadcastEvent('plugin-message', { message });
}

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSONL command must be an object.');
  }
  if (parsed.action !== 'ADD_NODE' && parsed.action !== 'UPDATE_NODE') {
    throw new Error(`Unsupported stream action: ${parsed.action}`);
  }
  return parsed;
}

app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  clients.add(res);
  sendEvent(res, 'ready', { status: 'connected', sequence });

  const heartbeat = setInterval(() => {
    sendEvent(res, 'heartbeat', { at: new Date().toISOString() });
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

app.post('/generate', (req, res) => {
  let buffer = '';
  let accepted = 0;
  let rejected = 0;

  req.setEncoding('utf8');

  req.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      try {
        const command = parseJsonLine(line);
        if (!command) continue;
        broadcast(command);
        accepted += 1;
      } catch (err) {
        rejected += 1;
        console.warn(`[hds-bridge] rejected line: ${err.message}`);
      }
    }
  });

  req.on('end', () => {
    const finalLine = buffer.trim();
    if (finalLine) {
      try {
        const command = parseJsonLine(finalLine);
        if (command) {
          broadcast(command);
          accepted += 1;
        }
      } catch (err) {
        rejected += 1;
        console.warn(`[hds-bridge] rejected final line: ${err.message}`);
      }
    }

    res.status(rejected ? 207 : 200).json({
      status: rejected ? 'partial' : 'ok',
      accepted,
      rejected,
      clients: clients.size,
      sequence,
    });
  });

  req.on('error', (err) => {
    console.error('[hds-bridge] request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });
});

app.use(express.json({ limit: '50mb' })); // Increased limit for heavy component trees

const MANIFEST_PATH = path.join(process.cwd(), 'public/hds-manifest.json');
const PLUGIN_SOURCE_DIR = path.join(process.cwd(), 'figma-agent-plugin');

// --- Phase 3: Canvas Selection Store ---
app.post('/selection', (req, res) => {
  currentSelection = req.body;
  res.json({ ok: true });
});

app.get('/selection', (req, res) => {
  res.json(currentSelection || {});
});

// p6-2: /lint runs the validator suite (manifest, token, a11y,
// swiss-canon, binding-completeness) over a serialized selection in the
// p6-1 manifest-aware shape and returns structured findings. Two entry
// points share one handler:
//   GET  /lint           — lints whatever is in the in-memory
//                          currentSelection store (the latest payload
//                          POSTed by the plugin to /selection)
//   POST /lint           — lints the request body directly. Accepts the
//                          same shapes the validator does:
//                          { tree: [...] }  |  [...]  |  single node
//                          |  a JSX string
// Guarded behind `lintEnabled` in bridge.config.json; flag-off path is a
// no-op that returns 404 so probes can't infer feature availability.
function readLintFlag() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bridge.config.json'), 'utf8'));
    return cfg && cfg.lintEnabled === true;
  } catch {
    return false;
  }
}

async function runLint(input) {
  // Lazy-import so the validator graph doesn't load on cold-start when
  // the flag is off — keeps `node scripts/hds-bridge.mjs` boot cheap and
  // avoids touching the manifest from disk twice on every request.
  const { default: lintValidator } = await import('../validators/lint.mjs');
  const result = await lintValidator(input);
  // Surface as `findings` (the unit's validationCmd shape) AND as
  // `{ok, errors}` (the rest of the validator suite's contract). Both
  // point at the same array — never diverge.
  return {
    ok: result.ok,
    errors: result.errors,
    findings: result.errors,
  };
}

function lintFlagOffResponse(res) {
  return res.status(404).json({
    status: 'error',
    error: 'lint endpoint disabled',
    flag: 'lintEnabled',
  });
}

app.get('/lint', async (req, res) => {
  if (!readLintFlag()) return lintFlagOffResponse(res);
  try {
    const result = await runLint(currentSelection || {});
    return res.status(200).json(result);
  } catch (err) {
    console.error('[hds-bridge] /lint error:', err);
    return res.status(500).json({ status: 'error', error: err.message, ok: false, errors: [], findings: [] });
  }
});

app.post('/lint', async (req, res) => {
  if (!readLintFlag()) return lintFlagOffResponse(res);
  try {
    const result = await runLint(req.body == null || (typeof req.body === 'object' && Object.keys(req.body).length === 0)
      ? (currentSelection || {})
      : req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[hds-bridge] /lint error:', err);
    return res.status(500).json({ status: 'error', error: err.message, ok: false, errors: [], findings: [] });
  }
});

// p6-3: /contrast runs WCAG 2.1 luminance math over a serialized
// selection in the p6-1 manifest-aware shape and returns
// {ok, pairs:[{fg, bg, ratio, AA, AAA}], errors}. Two entry points share
// one handler:
//   GET  /contrast       — checks whatever is in the in-memory
//                          currentSelection store (the latest payload
//                          POSTed by the plugin to /selection)
//   POST /contrast       — checks the request body directly. Same input
//                          shapes the validator accepts: { tree: [...] },
//                          { selection: [...] }, [...], or a single node.
// Guarded behind `contrastEnabled` in bridge.config.json; flag-off path
// is a no-op that returns 404 so probes can't infer feature availability.
function readContrastFlag() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bridge.config.json'), 'utf8'));
    return cfg && cfg.contrastEnabled === true;
  } catch {
    return false;
  }
}

function readPairFlag() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bridge.config.json'), 'utf8'));
    return cfg && cfg.pairEnabled === true;
  } catch {
    return false;
  }
}

async function runContrast(input) {
  // Lazy import — same reasoning as runLint: keeps cold-start cheap and
  // avoids touching hirobius.tokens.json from disk when the flag is off.
  const { default: contrastValidator } = await import('../validators/contrast.mjs');
  return contrastValidator(input);
}

function contrastFlagOffResponse(res) {
  return res.status(404).json({
    status: 'error',
    error: 'contrast endpoint disabled',
    flag: 'contrastEnabled',
  });
}

app.get('/contrast', async (req, res) => {
  if (!readContrastFlag()) return contrastFlagOffResponse(res);
  try {
    const result = await runContrast(currentSelection || {});
    return res.status(200).json(result);
  } catch (err) {
    console.error('[hds-bridge] /contrast error:', err);
    return res.status(500).json({ status: 'error', error: err.message, ok: false, pairs: [], errors: [] });
  }
});

app.post('/contrast', async (req, res) => {
  if (!readContrastFlag()) return contrastFlagOffResponse(res);
  try {
    const result = await runContrast(req.body == null || (typeof req.body === 'object' && Object.keys(req.body).length === 0)
      ? (currentSelection || {})
      : req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[hds-bridge] /contrast error:', err);
    return res.status(500).json({ status: 'error', error: err.message, ok: false, pairs: [], errors: [] });
  }
});

// p5-3: HMAC auth middleware. Runs BEFORE the business-logic handler so
// rejected requests never touch correlation, broadcast, or any other
// downstream state. When `authEnabled` is false the middleware calls
// next() unconditionally — flag-off behavior is identical to pre-p5-3.
const authMiddleware = createAuthMiddleware({ secret: HDS_BRIDGE_SECRET });

// Unwrap an envelope-shaped body to the inner message. With auth on the
// body is `{ id, type, payload, timestamp, hmac }`; the actual plugin
// message lives in `payload`. With auth off the body is the legacy flat
// shape and is returned untouched. Detection is purely structural —
// presence of all five envelope fields — so callers can't accidentally
// double-unwrap a flat message that happens to carry a `payload` key.
function unwrapEnvelope(body) {
  if (
    body && typeof body === 'object' && !Array.isArray(body) &&
    typeof body.id === 'string' &&
    typeof body.type === 'string' &&
    typeof body.timestamp === 'number' &&
    typeof body.hmac === 'string' &&
    body.payload && typeof body.payload === 'object'
  ) {
    return body.payload;
  }
  return body;
}

app.post('/plugin-message', authMiddleware, (req, res) => {
  // p5-3: with auth on the body is an envelope and the real plugin
  // message lives in body.payload. The flag-off path is byte-equivalent
  // to pre-p5-3 because unwrapEnvelope is a no-op for non-envelope
  // shapes.
  const message = unwrapEnvelope(req.body);

  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return res.status(400).json({
      status: 'error',
      message: 'plugin-message body must be a JSON object.',
    });
  }

  // p5-2: if the inbound message echoes an `inReplyTo` id and the
  // correlation feature flag is on, resolve the pending entry. Unknown
  // ids are logged and ignored — never thrown — so a misbehaving plugin
  // can't crash the bridge. The flag-off branch is a strict no-op so the
  // wire response shape matches pre-p5-2 byte for byte.
  const correlationOn = readCorrelationFlag();
  let correlated;

  // p5-4: plugin runtime-error channel. When the plugin can't apply a
  // node tree (missing master, font load failure, unknown token path)
  // it posts `{ type: 'render-error', inReplyTo, code, message }`. Treat
  // it as the reject-side counterpart to p5-2's resolve: the bridge
  // looks up the pending entry by inReplyTo and rejects it so the retry
  // loop's runtime-error path observes the failure identically to a
  // validator error. Guarded by `runtimeErrorsEnabled` AND
  // `correlationEnabled` — the flag-off path is byte-equivalent to
  // pre-p5-4 (plugin failures stay silent; the retry loop never sees
  // the error). Unknown inReplyTo ids are logged and ignored.
  let renderError;
  if (message && message.type === 'render-error') {
    const runtimeErrorsOn = readRuntimeErrorsFlag();
    if (runtimeErrorsOn && correlationOn) {
      renderError = handleRenderError({ message, runtimeErrorsEnabled: true });
      if (!renderError.matched) {
        console.log(
          `[hds-bridge] runtime-error: ` +
          (renderError.requestId
            ? `unknown inReplyTo id ${renderError.requestId} — ignoring`
            : `render-error missing inReplyTo — ignoring`)
        );
      } else {
        console.log(
          `[hds-bridge] runtime-error: rejected pending ${renderError.requestId} (code=${renderError.code})`
        );
      }
    }
  } else if (correlationOn && typeof message.inReplyTo === 'string') {
    correlated = resolvePendingRequest(message.inReplyTo, message);
    if (!correlated) {
      console.log(`[hds-bridge] correlation: unknown inReplyTo id ${message.inReplyTo} — ignoring`);
    }
  }

  const payload = broadcastPluginMessage(message);
  console.log(`[hds-bridge] forwarded plugin message: ${message.type || 'unknown'}`);

  const response = {
    status: 'ok',
    clients: clients.size,
    sequence,
    forwarded: true,
    payload,
  };
  if (correlationOn) response.correlated = Boolean(correlated);
  if (renderError && renderError.dispatched) {
    response.renderError = {
      matched: Boolean(renderError.matched),
      code: renderError.code,
      requestId: renderError.requestId,
    };
  }
  return res.status(200).json(response);
});

// p5-2 diagnostic endpoint. Dev-only — the NODE_ENV guard prevents
// production deployments from leaking pending request metadata. Returns
// the current contents of the pending-Map for inspection by operators.
app.get('/pending-ids', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'not found' });
  }
  const pending = snapshotPending();
  return res.status(200).json({
    correlationEnabled: readCorrelationFlag(),
    ttlMs: REQUEST_TTL_MS,
    limit: PENDING_LIMIT,
    size: _pendingRequestsSize(),
    pending,
  });
});

// Build real Figma master components for the 13 generative-subset components.
// Reads the batch from pipeline/figma-masters-batch.mjs and broadcasts draw-component to the plugin.
app.post('/build-masters', async (req, res) => {
  try {
    if (clients.size === 0) {
      return res.status(409).json({
        status: 'no-clients',
        error: 'No plugin clients connected to /stream. Open the Figma plugin UI before building masters.',
      });
    }

    const { buildMastersBatch, GENERATIVE_SUBSET } = await import('../pipeline/figma-masters-batch.mjs');
    const batch = buildMastersBatch();
    const totalStates = batch.reduce((count, entry) => count + entry.states.length, 0);
    broadcastPluginMessage({ type: 'draw-component', batch });
    console.log(`[hds-bridge] /build-masters: ${GENERATIVE_SUBSET.length} components → ${clients.size} client(s)`);
    return res.status(200).json({
      status: 'ok',
      components: GENERATIVE_SUBSET.length,
      states: totalStates,
      clients: clients.size,
      sequence,
    });
  } catch (err) {
    console.error('[hds-bridge] /build-masters error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Component Payload Memory Store ---
let pendingComponentPayload = null;

// Endpoint for the Playwright script to "Store" the component tree
app.post('/store-component-payload', (req, res) => {
  pendingComponentPayload = req.body;
  console.log(`\n📦 Bridge: Received payload for [${req.body.component}]`);
  res.status(200).json({ status: 'stored' });
});

// Endpoint for the Figma Plugin to "Fetch" the component tree
app.get('/get-component-payload', (req, res) => {
  if (!pendingComponentPayload) {
    return res.status(404).json({ error: 'No payload pending' });
  }
  const payload = pendingComponentPayload;
  // pendingComponentPayload = null; // Optional: Clear after fetch for "Once-only" delivery
  console.log(`\n🚀 Bridge: Delivered payload for [${payload.component}] to Figma`);
  res.status(200).json(payload);
});

// Serve plugin-side modules (e.g. sync-tokens.js) so the Figma plugin can fetch
// and eval them at runtime. Whitelist a single directory and basename to stop
// path traversal — the plugin sandbox has no module system, so this is the
// closest equivalent to a runtime require().
app.get('/plugin-source/:file', (req, res) => {
  const safeName = path.basename(req.params.file);
  if (!/^[\w.-]+\.js$/.test(safeName)) return res.status(400).send('invalid filename');
  const filePath = path.join(PLUGIN_SOURCE_DIR, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).send('not found: ' + safeName);
  const source = fs.readFileSync(filePath, 'utf8');
  res.type('application/javascript').send(source);
});

// --- Existing Manifest Endpoints ---
app.get('/get-manifest', (req, res) => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  res.json(manifest);
});

app.post('/update-manifest', (req, res) => {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const newTokens = req.body.tokens;

    if (!Array.isArray(newTokens)) {
      return res.status(400).json({ error: 'tokens must be an array' });
    }

    const tiers = ['primitive', 'semantic', 'component'];
    let upserted = 0;
    let inserted = 0;

    for (const newToken of newTokens) {
      if (!newToken || typeof newToken !== 'object') continue;

      // Search all tiers — match by path first, fall back to name.
      let found = false;
      for (const tier of tiers) {
        const list = manifest.tokens[tier];
        if (!Array.isArray(list)) continue;

        const idx = list.findIndex(t =>
          (newToken.path && t.path === newToken.path) ||
          (newToken.name && t.name === newToken.name)
        );

        if (idx > -1) {
          manifest.tokens[tier][idx] = Object.assign({}, manifest.tokens[tier][idx], newToken);
          upserted += 1;
          found = true;
          break;
        }
      }

      if (!found) {
        if (!Array.isArray(manifest.tokens.primitive)) manifest.tokens.primitive = [];
        manifest.tokens.primitive.push(newToken);
        inserted += 1;
      }
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    res.status(200).json({ status: 'ok', upserted, inserted });
  } catch (err) {
    console.error('[hds-bridge] /update-manifest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// p6-4: reverse token sync. The Figma plugin reads its three managed
// Variables collections (HDS Primitive / Semantic / Component) and POSTs
// the result here. The bridge validates the manifest-shaped payload via
// validators/token-sync.mjs and writes the normalized output to
// `tokens-from-figma.json` for human review. We deliberately do NOT
// touch `hirobius.tokens.json` or `public/hds-manifest.json` — that
// merge is a separate, opt-in step a human runs after diffing.
//
// Guarded behind `reverseTokenSyncEnabled` in bridge.config.json. The
// flag-off path returns 404 so probes can't infer feature availability,
// matching the same shape used by /lint and /contrast.
function readReverseTokenSyncFlag() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bridge.config.json'), 'utf8'));
    return cfg && cfg.reverseTokenSyncEnabled === true;
  } catch {
    return false;
  }
}

const TOKENS_FROM_FIGMA_PATH = path.join(process.cwd(), 'tokens-from-figma.json');

app.post('/tokens-from-figma', async (req, res) => {
  if (!readReverseTokenSyncFlag()) {
    return res.status(404).json({
      status: 'error',
      error: 'reverse token sync disabled',
      flag: 'reverseTokenSyncEnabled',
    });
  }
  try {
    const { default: validateTokenSync } = await import('../validators/token-sync.mjs');
    const result = validateTokenSync(req.body);
    if (!result.ok) {
      return res.status(400).json({
        status: 'error',
        ok: false,
        errors: result.errors,
        wrote: null,
      });
    }
    fs.writeFileSync(TOKENS_FROM_FIGMA_PATH, JSON.stringify(result.normalized, null, 2));
    const counts = {
      primitive: result.normalized.tokens.primitive.length,
      semantic: result.normalized.tokens.semantic.length,
      component: result.normalized.tokens.component.length,
    };
    console.log(
      `[hds-bridge] /tokens-from-figma wrote ${TOKENS_FROM_FIGMA_PATH} ` +
      `(primitive=${counts.primitive}, semantic=${counts.semantic}, component=${counts.component})`
    );
    return res.status(200).json({
      status: 'ok',
      ok: true,
      errors: [],
      wrote: 'tokens-from-figma.json',
      counts,
    });
  } catch (err) {
    console.error('[hds-bridge] /tokens-from-figma error:', err);
    return res.status(500).json({ status: 'error', ok: false, errors: [{ code: 'BRIDGE_ERROR', message: err.message }] });
  }
});

// 11a-2: orchestration approval endpoints.
//
// GET  /orchestration/list                      → all units (optional ?approval=<value>)
// POST /orchestration/approve { id, approval, comment?, edits? }
//                                              → atomic read-mutate-write of
//                                                docs/ai/orchestration.json,
//                                                appends history.jsonl event
//
// Localhost-only — the loopback guard middleware below short-circuits any
// non-loopback caller with 403 before the handler runs. Auth is deferred
// per Q1=(a) ratification 2026-05-01 (no /run endpoint, no live trigger).
//
// Per the unit spec (11a-2): "approve flips status proposed→pending; the
// next pnpm hds:run / autonomous session picks up the newly-pending units."
// We do NOT mark units done here — that remains the orchestrator's job after
// validationCmd exits 0.

const ORCHESTRATION_PATH = path.join(process.cwd(), 'docs/ai/orchestration.json');
const ORCHESTRATION_HISTORY_PATH = path.join(process.cwd(), 'docs/ai/orchestration.history.jsonl');
const APPROVAL_VALUES = new Set(['proposed', 'approved', 'denied', 'needs-grilling']);

function isLoopbackIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  // Strip IPv6-mapped IPv4 prefix that node attaches in dual-stack mode
  const stripped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return (
    stripped === '127.0.0.1' ||
    stripped === 'localhost' ||
    ip === '::1' ||
    stripped === '::1'
  );
}

function loopbackOnly(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (!isLoopbackIp(ip)) {
    return res.status(403).json({
      status: 'error',
      error: 'orchestration endpoints are localhost-only',
      ip,
    });
  }
  return next();
}

function readOrchestration() {
  const raw = fs.readFileSync(ORCHESTRATION_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeOrchestration(data) {
  // Atomic-ish write: serialize first, then single fs.writeFileSync. Node's
  // writeFileSync is a one-syscall O_TRUNC|O_WRONLY|O_CREAT — partial writes
  // on a local fs are vanishingly unlikely. The 'mutate' part of "atomic
  // read-mutate-write" is in-memory only.
  fs.writeFileSync(ORCHESTRATION_PATH, JSON.stringify(data, null, 2) + '\n');
}

function appendOrchestrationHistory(event) {
  // One-line JSONL events for 11a-6 history view. Append-only; never rewrite.
  fs.appendFileSync(ORCHESTRATION_HISTORY_PATH, JSON.stringify(event) + '\n');
}

const EDITABLE_FIELDS = new Set(['description', 'priority', 'sprint', 'agentNotes']);

function applyEdits(unit, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
    return { changed: [], invalid: [] };
  }
  const changed = [];
  const invalid = [];
  for (const [key, value] of Object.entries(edits)) {
    if (!EDITABLE_FIELDS.has(key)) {
      invalid.push({ key, reason: 'field not editable' });
      continue;
    }
    if (key === 'priority' && (!Number.isInteger(value) || value < 1 || value > 5)) {
      invalid.push({ key, reason: 'priority must be integer 1..5' });
      continue;
    }
    if (key === 'sprint' && (!Number.isInteger(value) || value < 0 || value > 6)) {
      invalid.push({ key, reason: 'sprint must be integer 0..6' });
      continue;
    }
    if (key === 'description' && typeof value !== 'string') {
      invalid.push({ key, reason: 'description must be string' });
      continue;
    }
    if (key === 'agentNotes' && !Array.isArray(value)) {
      invalid.push({ key, reason: 'agentNotes must be array' });
      continue;
    }
    unit[key] = value;
    changed.push(key);
  }
  return { changed, invalid };
}

app.get('/orchestration/list', loopbackOnly, (req, res) => {
  try {
    const data = readOrchestration();
    const units = Array.isArray(data.units) ? data.units : [];
    const filter = typeof req.query.approval === 'string' ? req.query.approval : null;
    const filtered = filter
      ? units.filter((u) => u && u.approval === filter)
      : units;
    return res.status(200).json({
      status: 'ok',
      total: units.length,
      filter,
      count: filtered.length,
      units: filtered,
    });
  } catch (err) {
    console.error('[hds-bridge] /orchestration/list error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/orchestration/approve', loopbackOnly, (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = typeof body.id === 'string' ? body.id : null;
    const approval = typeof body.approval === 'string' ? body.approval : null;
    const comment = typeof body.comment === 'string' ? body.comment : null;
    const edits = body.edits && typeof body.edits === 'object' && !Array.isArray(body.edits)
      ? body.edits
      : null;

    if (!id) {
      return res.status(400).json({ status: 'error', error: 'id is required' });
    }
    if (!approval || !APPROVAL_VALUES.has(approval)) {
      return res.status(400).json({
        status: 'error',
        error: `approval must be one of [${Array.from(APPROVAL_VALUES).join('|')}]`,
      });
    }

    const data = readOrchestration();
    const units = Array.isArray(data.units) ? data.units : [];
    const unit = units.find((u) => u && u.id === id);
    if (!unit) {
      return res.status(404).json({ status: 'error', error: `unit not found: ${id}` });
    }

    const previousApproval = unit.approval ?? null;
    const previousStatus = unit.status ?? null;

    let editResult = { changed: [], invalid: [] };
    if (edits) {
      editResult = applyEdits(unit, edits);
      if (editResult.invalid.length > 0) {
        return res.status(400).json({
          status: 'error',
          error: 'invalid edits',
          invalid: editResult.invalid,
        });
      }
    }

    unit.approval = approval;

    // Per Q1=(a) ratification 2026-05-01: approve flips status proposed→pending.
    // Other approval transitions do NOT touch status — denied units keep
    // whatever status they had (typically `proposed`); needs-grilling sits
    // back in the inbox; explicit `proposed` is a reset to inbox.
    let statusFlipped = false;
    if (approval === 'approved' && unit.status === 'proposed') {
      unit.status = 'pending';
      statusFlipped = true;
    }

    writeOrchestration(data);

    const event = {
      ts: new Date().toISOString(),
      action: 'approve',
      id,
      from: { approval: previousApproval, status: previousStatus },
      to: { approval, status: unit.status },
      statusFlipped,
      edits: editResult.changed,
      comment,
    };
    appendOrchestrationHistory(event);

    return res.status(200).json({
      status: 'ok',
      id,
      approval,
      previousApproval,
      previousStatus,
      currentStatus: unit.status,
      statusFlipped,
      editsApplied: editResult.changed,
    });
  } catch (err) {
    console.error('[hds-bridge] /orchestration/approve error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── 12h-3: POST /inject-template ───────────────────────────────────────────
//
// Accepts { templateId } and broadcasts an `inject-template` plugin-message
// so the Figma plugin sandbox can create the page layout frames. The bridge
// is the command bus; the actual Figma API calls happen in code.js.
//
// We read the template registry from figma-agent-plugin/templates.js to
// validate the templateId server-side before forwarding.
const TEMPLATES_PATH = path.join(process.cwd(), 'figma-agent-plugin', 'templates.js');

function loadTemplateRegistry() {
  try {
    // Inline require() — templates.js is a vanilla CommonJS-style module.
    const src = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    const mod = { exports: {} };
    // Sandboxed eval to avoid polluting the bridge globals.
    (new Function('module', 'exports', 'globalThis', src))(mod, mod.exports, {});
    return mod.exports.TEMPLATE_MAP || {};
  } catch (err) {
    console.warn('[hds-bridge] could not load template registry:', err.message);
    return {};
  }
}

app.post('/inject-template', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : null;

    if (!templateId) {
      return res.status(400).json({ status: 'error', error: 'templateId is required' });
    }

    const registry = loadTemplateRegistry();
    if (!registry[templateId]) {
      const validIds = Object.keys(registry);
      return res.status(400).json({
        status: 'error',
        error: `unknown templateId: ${templateId}`,
        validIds,
      });
    }

    const template = registry[templateId];

    // Broadcast to the Figma plugin so it can call figma.createFrame() etc.
    broadcastPluginMessage({ type: 'inject-template', template: templateId, templateSpec: template });

    return res.status(200).json({
      status: 'ok',
      templateId,
      templateName: template.name,
      sections: template.sections ? template.sections.length : 0,
    });
  } catch (err) {
    console.error('[hds-bridge] /inject-template error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── 12h-4: GET /build-status ────────────────────────────────────────────────
//
// Reads docs/ai/orchestration.json and returns a summary of build progress:
// total units, done, in-progress (claimed+in-progress), pending, and a
// per-phase breakdown. Used by the Figma plugin status tab to render a
// build-status frame on the '🔄 Build Status' page.
app.get('/build-status', (req, res) => {
  try {
    const data = readOrchestration();
    const units = Array.isArray(data.units) ? data.units : [];

    const totalUnits = units.length;
    let done = 0;
    let inProgress = 0;
    let pending = 0;

    const phaseMap = {};

    for (const u of units) {
      if (!u || typeof u !== 'object') continue;
      const status = u.status || 'unknown';
      const phase = u.phase != null ? String(u.phase) : 'unknown';

      if (!phaseMap[phase]) {
        phaseMap[phase] = { phase, done: 0, total: 0 };
      }
      phaseMap[phase].total += 1;

      if (status === 'done') {
        done += 1;
        phaseMap[phase].done += 1;
      } else if (status === 'claimed' || status === 'in-progress') {
        inProgress += 1;
      } else if (status === 'pending' || status === 'approved') {
        pending += 1;
      }
    }

    const phases = Object.values(phaseMap).sort((a, b) => {
      // Numeric phases first, then string phases
      const aNum = Number(a.phase);
      const bNum = Number(b.phase);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return a.phase.localeCompare(b.phase);
    });

    return res.status(200).json({
      status: 'ok',
      totalUnits,
      done,
      inProgress,
      pending,
      phases,
    });
  } catch (err) {
    console.error('[hds-bridge] /build-status error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// Test hook — exporting the express `app` lets test-bridge-endpoints.mjs
// drive the handlers via supertest-style fetch against an ephemeral port
// without spinning up the full bridge boot sequence.
export { app, isLoopbackIp, EDITABLE_FIELDS, APPROVAL_VALUES };

// Don't auto-listen when the file is imported (test mode). Detect via
// `import.meta.url === argv[1]` — Node's standard "is this the entry
// module" idiom.
const isEntryModule = (() => {
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isEntryModule) {
  app.listen(PORT, () => {
    console.log(`\n🌉 HDS Bridge live at http://localhost:${PORT}`);
    console.log(`   - Manifest: http://localhost:${PORT}/get-manifest`);
    console.log(`   - Component Store: http://localhost:${PORT}/get-component-payload`);
    console.log(`   - Plugin Source: http://localhost:${PORT}/plugin-source/:file`);
    console.log(`   - SSE Stream: http://localhost:${PORT}/stream`);
    console.log(`   - LLM Input: http://localhost:${PORT}/generate`);
    console.log(`   - Plugin Message: http://localhost:${PORT}/plugin-message`);
    console.log(`   - Build Masters:  http://localhost:${PORT}/build-masters`);
    console.log(`   - Selection Store: http://localhost:${PORT}/selection`);
    console.log(`   - Tokens from Figma: http://localhost:${PORT}/tokens-from-figma`);
    console.log(`   - Contrast (p6-3, ${readContrastFlag() ? 'enabled' : 'disabled'}): http://localhost:${PORT}/contrast`);
    console.log(`   - Orchestration List (11a-2): http://localhost:${PORT}/orchestration/list`);
    console.log(`   - Orchestration Approve (11a-2): http://localhost:${PORT}/orchestration/approve`);
    console.log(`   - Pair (12h-2, ${readPairFlag() ? 'enabled — GET /pair for setup token' : 'disabled'}): http://localhost:${PORT}/pair`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`   - Pending IDs (dev): http://localhost:${PORT}/pending-ids`);
    }
  });
}
