/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * HDS Manifest → Figma Variable Sync Engine
 *
 * Canonical source loaded by code.js at runtime via the bridge endpoint
 *   GET http://localhost:3005/plugin-source/sync-tokens.js
 * The plugin sandbox has no module system; this file uses a UMD-ish wrapper
 * so it can also be required from Node tests via `require('./sync-tokens.js')`.
 *
 * Entry point: HDSSyncTokens.runSync(manifest) → { summary, created, updated, ... }
 *
 * Contract with the manifest (public/hds-manifest.json):
 *   - tokens.primitive[]: { path, type: 'color'|'dimension'|'number', value }
 *   - tokens.semantic[]:  { path, type, alias?: '{primitive.x.y}', resolvedValue?, dark?: { alias, resolvedValue } }
 */

(function (root) {
  const PRIMITIVE_NAME = 'HDS Primitive';
  const SEMANTIC_NAME  = 'HDS Semantic';
  const COMPONENT_NAME = 'HDS Component';

  // ── Color parsing ────────────────────────────────────────────────────────────

  function clamp01(n) { return Math.max(0, Math.min(1, n)); }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const a = h.length === 8 ? parseInt(v.slice(6, 8), 16) / 255 : 1;
    return {
      r: parseInt(v.slice(0, 2), 16) / 255,
      g: parseInt(v.slice(2, 4), 16) / 255,
      b: parseInt(v.slice(4, 6), 16) / 255,
      a
    };
  }

  /**
   * OKLCH → sRGB via Björn Ottosson's coefficients (CSS Color 4 spec).
   * L is 0..1 (or 0%..100%), C is unbounded, h is degrees.
   */
  function oklchToRgb(L, C, h) {
    const hRad = (h * Math.PI) / 180;
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const lc = l_ * l_ * l_;
    const mc = m_ * m_ * m_;
    const sc = s_ * s_ * s_;

    const lr =  4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
    const lg = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
    const lb = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc;

    const toSrgb = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
    return { r: clamp01(toSrgb(lr)), g: clamp01(toSrgb(lg)), b: clamp01(toSrgb(lb)), a: 1 };
  }

  function parseColor(value) {
    if (value && typeof value === 'object' && typeof value.r === 'number') return {
      r: clamp01(value.r), g: clamp01(value.g), b: clamp01(value.b),
      a: typeof value.a === 'number' ? clamp01(value.a) : 1
    };
    if (typeof value !== 'string') return null;
    const v = value.trim();

    if (v[0] === '#') return hexToRgb(v);

    const oklch = v.match(/^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i);
    if (oklch) {
      let L = parseFloat(oklch[1]);
      if (oklch[1].endsWith('%')) L = L / 100;
      const C = parseFloat(oklch[2]);
      const h = parseFloat(oklch[3]);
      const rgb = oklchToRgb(L, C, h);
      if (oklch[4]) {
        let alpha = parseFloat(oklch[4]);
        if (oklch[4].endsWith('%')) alpha /= 100;
        rgb.a = clamp01(alpha);
      }
      return rgb;
    }

    const rgbMatch = v.match(/^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)(?:[\s,/]+([0-9.]+%?))?\s*\)$/i);
    if (rgbMatch) {
      const r = parseFloat(rgbMatch[1]) / 255;
      const g = parseFloat(rgbMatch[2]) / 255;
      const b = parseFloat(rgbMatch[3]) / 255;
      let a = 1;
      if (rgbMatch[4]) {
        a = parseFloat(rgbMatch[4]);
        if (rgbMatch[4].endsWith('%')) a /= 100;
      }
      return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
    }

    return null;
  }

  function parseDimension(value) {
    if (typeof value === 'number') return isNaN(value) ? null : value;
    if (typeof value !== 'string') return null;
    const n = parseFloat(value);
    return isNaN(n) ? null : n;
  }

  // ── Token / variable identity helpers ────────────────────────────────────────

  /**
   * Match the existing render-trigger naming convention so SYNC_TOKENS is a
   * drop-in upgrade and won't double-create variables.
   * "primitive.color.neutral.50" → "color-neutral-50"
   * "semantic.color.surface.page" → "color-surface-page"
   */
  function nameFromPath(path) {
    return String(path || '').split('.').slice(1).join('-');
  }

  function stripBraces(s) {
    return String(s == null ? '' : s).replace(/^\{|\}$/g, '').trim();
  }

  function inferFigmaType(token) {
    if (!token || !token.type) return null;
    if (token.type === 'color') return 'COLOR';
    if (token.type === 'dimension' || token.type === 'number') return 'FLOAT';
    return null;
  }

  function colorsEqual(a, b, eps) {
    if (!a || !b) return false;
    const e = eps == null ? 1 / 512 : eps;
    return (
      Math.abs(a.r - b.r) < e &&
      Math.abs(a.g - b.g) < e &&
      Math.abs(a.b - b.b) < e &&
      Math.abs((a.a == null ? 1 : a.a) - (b.a == null ? 1 : b.a)) < e
    );
  }

  function aliasMatches(currentValue, targetVariable) {
    return !!(
      currentValue &&
      typeof currentValue === 'object' &&
      currentValue.type === 'VARIABLE_ALIAS' &&
      targetVariable &&
      currentValue.id === targetVariable.id
    );
  }

  // ── Figma collection / mode plumbing ─────────────────────────────────────────

  async function ensureCollection(name) {
    const all = await figma.variables.getLocalVariableCollectionsAsync();
    const existing = all.find((c) => c.name === name);
    if (existing) return { collection: existing, createdCollection: false };
    const created = figma.variables.createVariableCollection(name);
    return { collection: created, createdCollection: true };
  }

  /**
   * Themeable manifests get Light + Dark modes on the semantic collection.
   * Single-mode manifests keep the original default mode untouched (renamed
   * to "Default" for clarity if it was the auto-generated "Mode 1").
   *
   * Multi-mode requires a paid Figma plan; failures degrade to a single mode.
   */
  function ensureSemanticModes(collection, themeable) {
    const out = { Light: null, Dark: null, Default: null, errors: [] };
    const modes = collection.modes || [];

    if (themeable) {
      let lightMode = modes.find((m) => m.name.toLowerCase() === 'light');
      if (!lightMode) {
        const first = modes[0];
        if (first) {
          try { collection.renameMode(first.modeId, 'Light'); } catch (err) { out.errors.push('rename→Light: ' + err.message); }
          lightMode = { modeId: first.modeId, name: 'Light' };
        } else {
          try {
            const newId = collection.addMode('Light');
            lightMode = { modeId: newId, name: 'Light' };
          } catch (err) { out.errors.push('addMode Light: ' + err.message); }
        }
      }
      if (lightMode) out.Light = lightMode.modeId;

      let darkMode = (collection.modes || []).find((m) => m.name.toLowerCase() === 'dark');
      if (!darkMode) {
        try {
          const newId = collection.addMode('Dark');
          darkMode = { modeId: newId, name: 'Dark' };
        } catch (err) {
          // Free plan: addMode throws. Fall back to Light only.
          out.errors.push('addMode Dark (paid feature?): ' + err.message);
        }
      }
      if (darkMode) out.Dark = darkMode.modeId;
    } else {
      const first = modes[0];
      if (first) out.Default = first.modeId;
    }

    return out;
  }

  async function indexCollectionByName(collection) {
    const all = await figma.variables.getLocalVariablesAsync();
    const map = new Map();
    for (const v of all) {
      if (v.variableCollectionId === collection.id) map.set(v.name, v);
    }
    return map;
  }

  // ── Value writers ────────────────────────────────────────────────────────────

  function setColor(variable, modeId, rgb) {
    if (!rgb || modeId == null) return false;
    const payload = { r: rgb.r, g: rgb.g, b: rgb.b, a: rgb.a == null ? 1 : rgb.a };
    try { variable.setValueForMode(modeId, payload); return true; }
    catch (_) {
      try { variable.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b }); return true; }
      catch (err) { return false; }
    }
  }

  function setFloat(variable, modeId, n) {
    if (modeId == null || typeof n !== 'number' || isNaN(n)) return false;
    try { variable.setValueForMode(modeId, n); return true; } catch (_) { return false; }
  }

  function setAlias(variable, modeId, targetVariable) {
    if (!targetVariable || modeId == null) return false;
    let aliasValue;
    try {
      aliasValue = figma.variables.createVariableAlias
        ? figma.variables.createVariableAlias(targetVariable)
        : { type: 'VARIABLE_ALIAS', id: targetVariable.id };
    } catch (_) {
      aliasValue = { type: 'VARIABLE_ALIAS', id: targetVariable.id };
    }
    try { variable.setValueForMode(modeId, aliasValue); return true; }
    catch (_) { return false; }
  }

  // ── Sync passes ──────────────────────────────────────────────────────────────

  async function syncPrimitives(manifest, primColl, report) {
    const byName = await indexCollectionByName(primColl);
    const modeId = primColl.modes[0].modeId;
    const indexByPath = {};
    const tokens = (manifest.tokens && manifest.tokens.primitive) || [];

    for (const t of tokens) {
      const figmaType = inferFigmaType(t);
      if (!figmaType) {
        report.skipped.push({ path: t.path, reason: 'unsupported type: ' + t.type });
        continue;
      }
      const name = t.name || nameFromPath(t.path);

      let v = byName.get(name);
      let isNew = false;
      if (!v) {
        try { v = figma.variables.createVariable(name, primColl.id, figmaType); isNew = true; }
        catch (err) { report.errors.push({ path: t.path, error: 'createVariable: ' + err.message }); continue; }
      } else if (v.resolvedType !== figmaType) {
        report.errors.push({ path: t.path, error: 'type mismatch: existing=' + v.resolvedType + ' wanted=' + figmaType });
        continue;
      }

      let changed = false;

      if (figmaType === 'COLOR') {
        const rgb = parseColor(t.value);
        if (!rgb) {
          report.errors.push({ path: t.path, error: 'unparseable color: ' + JSON.stringify(t.value) });
        } else {
          const existing = v.valuesByMode && v.valuesByMode[modeId];
          if (!isNew && existing && colorsEqual(existing, rgb)) { /* unchanged */ }
          else { setColor(v, modeId, rgb); changed = true; }
        }
      } else {
        const n = parseDimension(t.value);
        if (n == null) {
          report.errors.push({ path: t.path, error: 'unparseable dimension: ' + JSON.stringify(t.value) });
        } else {
          const existing = v.valuesByMode && v.valuesByMode[modeId];
          if (!isNew && typeof existing === 'number' && existing === n) { /* unchanged */ }
          else { setFloat(v, modeId, n); changed = true; }
        }
      }

      if (t.description && v.description !== t.description) {
        try { v.description = t.description; changed = true; } catch (_) {}
      }

      if (isNew) report.created.push(t.path);
      else if (changed) report.updated.push(t.path);
      else report.unchanged.push(t.path);

      indexByPath[t.path] = v;
    }

    return indexByPath;
  }

  async function applySemanticValue(variable, modeId, payload, primIndex, figmaType, report, tokenPath, modeLabel) {
    if (!payload) return false;
    if (payload.alias) {
      const aliasPath = stripBraces(payload.alias);
      const target = primIndex[aliasPath];
      if (!target) {
        report.errors.push({ path: tokenPath, error: modeLabel + ' alias target missing: ' + aliasPath });
        return false;
      }
      if (target.resolvedType !== figmaType) {
        report.errors.push({ path: tokenPath, error: modeLabel + ' alias type mismatch: ' + aliasPath + ' is ' + target.resolvedType });
        return false;
      }
      const current = variable.valuesByMode && variable.valuesByMode[modeId];
      if (aliasMatches(current, target)) return false;
      return setAlias(variable, modeId, target);
    }
    const raw = payload.value != null ? payload.value : payload.resolvedValue;
    if (raw == null) return false;
    if (figmaType === 'COLOR') {
      const rgb = parseColor(raw);
      if (!rgb) { report.errors.push({ path: tokenPath, error: modeLabel + ' unparseable color: ' + JSON.stringify(raw) }); return false; }
      const current = variable.valuesByMode && variable.valuesByMode[modeId];
      if (current && colorsEqual(current, rgb)) return false;
      return setColor(variable, modeId, rgb);
    }
    const n = parseDimension(raw);
    if (n == null) { report.errors.push({ path: tokenPath, error: modeLabel + ' unparseable dimension: ' + JSON.stringify(raw) }); return false; }
    const current = variable.valuesByMode && variable.valuesByMode[modeId];
    if (typeof current === 'number' && current === n) return false;
    return setFloat(variable, modeId, n);
  }

  async function syncSemantics(manifest, semColl, primIndex, report) {
    const tokens = (manifest.tokens && manifest.tokens.semantic) || [];
    const themeable = tokens.some((t) => t && t.dark);
    const modeIds = ensureSemanticModes(semColl, themeable);
    if (modeIds.errors.length) {
      for (const e of modeIds.errors) report.errors.push({ path: '__modes__', error: e });
    }

    const byName = await indexCollectionByName(semColl);
    const indexByPath = {};
    const lightMode = modeIds.Light != null ? modeIds.Light : modeIds.Default;
    const darkMode  = modeIds.Dark;

    for (const t of tokens) {
      const figmaType = inferFigmaType(t);
      if (!figmaType) {
        report.skipped.push({ path: t.path, reason: 'unsupported type: ' + t.type });
        continue;
      }
      const name = nameFromPath(t.path);

      let v = byName.get(name);
      let isNew = false;
      if (!v) {
        try { v = figma.variables.createVariable(name, semColl.id, figmaType); isNew = true; }
        catch (err) { report.errors.push({ path: t.path, error: 'createVariable: ' + err.message }); continue; }
      } else if (v.resolvedType !== figmaType) {
        report.errors.push({ path: t.path, error: 'type mismatch: existing=' + v.resolvedType + ' wanted=' + figmaType });
        continue;
      }

      let changed = false;

      // Light (or single default mode)
      const lightPayload = {
        alias: t.alias,
        value: t.value,
        resolvedValue: t.resolvedValue
      };
      const lightChanged = await applySemanticValue(v, lightMode, lightPayload, primIndex, figmaType, report, t.path, 'Light');
      if (lightChanged) changed = true;

      // Dark
      if (themeable && darkMode != null) {
        if (t.dark) {
          const darkChanged = await applySemanticValue(v, darkMode, t.dark, primIndex, figmaType, report, t.path, 'Dark');
          if (darkChanged) changed = true;
        } else {
          // Mirror Light to Dark so theme-flipped UIs stay legible.
          const lightVal = v.valuesByMode && v.valuesByMode[lightMode];
          if (lightVal !== undefined) {
            try {
              const current = v.valuesByMode && v.valuesByMode[darkMode];
              const same = current !== undefined && JSON.stringify(current) === JSON.stringify(lightVal);
              if (!same) { v.setValueForMode(darkMode, lightVal); changed = true; }
            } catch (_) {}
          }
        }
      }

      if (t.description && v.description !== t.description) {
        try { v.description = t.description; changed = true; } catch (_) {}
      }

      if (isNew) report.created.push(t.path);
      else if (changed) report.updated.push(t.path);
      else report.unchanged.push(t.path);

      indexByPath[t.path] = v;
    }

    // Detect orphans (variables in the collection but not in the manifest)
    const expected = new Set(tokens.map((t) => nameFromPath(t.path)));
    for (const [varName, variable] of byName) {
      if (!expected.has(varName)) {
        report.orphans.push({ collection: SEMANTIC_NAME, name: varName, id: variable.id });
      }
    }

    return { indexByPath, modeIds };
  }

  async function syncComponents(manifest, compColl, targetIndex, report) {
    const tokens = (manifest.tokens && manifest.tokens.component) || [];
    const themeable = tokens.some((t) => t && t.dark);
    const modeIds = ensureSemanticModes(compColl, themeable);
    if (modeIds.errors.length) {
      for (const e of modeIds.errors) report.errors.push({ path: '__component_modes__', error: e });
    }

    const byName = await indexCollectionByName(compColl);
    const indexByPath = {};
    const lightMode = modeIds.Light != null ? modeIds.Light : modeIds.Default;
    const darkMode  = modeIds.Dark;

    for (const t of tokens) {
      const figmaType = inferFigmaType(t);
      if (!figmaType) {
        report.skipped.push({ path: t.path, reason: 'unsupported type: ' + t.type });
        continue;
      }
      const name = nameFromPath(t.path);

      let v = byName.get(name);
      let isNew = false;
      if (!v) {
        try { v = figma.variables.createVariable(name, compColl.id, figmaType); isNew = true; }
        catch (err) { report.errors.push({ path: t.path, error: 'createVariable: ' + err.message }); continue; }
      } else if (v.resolvedType !== figmaType) {
        report.errors.push({ path: t.path, error: 'type mismatch: existing=' + v.resolvedType + ' wanted=' + figmaType });
        continue;
      }

      indexByPath[t.path] = v;
      targetIndex[t.path] = v;
    }

    for (const t of tokens) {
      const figmaType = inferFigmaType(t);
      if (!figmaType) continue;

      const v = indexByPath[t.path];
      if (!v) continue;

      let changed = false;

      const lightPayload = {
        alias: t.alias,
        value: t.value,
        resolvedValue: t.resolvedValue
      };
      const lightChanged = await applySemanticValue(v, lightMode, lightPayload, targetIndex, figmaType, report, t.path, 'Light');
      if (lightChanged) changed = true;

      if (themeable && darkMode != null) {
        if (t.dark) {
          const darkChanged = await applySemanticValue(v, darkMode, t.dark, targetIndex, figmaType, report, t.path, 'Dark');
          if (darkChanged) changed = true;
        } else {
          const lightVal = v.valuesByMode && v.valuesByMode[lightMode];
          if (lightVal !== undefined) {
            try {
              const current = v.valuesByMode && v.valuesByMode[darkMode];
              const same = current !== undefined && JSON.stringify(current) === JSON.stringify(lightVal);
              if (!same) { v.setValueForMode(darkMode, lightVal); changed = true; }
            } catch (_) {}
          }
        }
      }

      if (t.description && v.description !== t.description) {
        try { v.description = t.description; changed = true; } catch (_) {}
      }

      if (report.created.indexOf(t.path) !== -1 || report.updated.indexOf(t.path) !== -1 || report.unchanged.indexOf(t.path) !== -1) {
        continue;
      }
      if (!byName.get(nameFromPath(t.path))) report.created.push(t.path);
      else if (changed) report.updated.push(t.path);
      else report.unchanged.push(t.path);
    }

    const expected = new Set(tokens.map((t) => nameFromPath(t.path)));
    for (const [varName, variable] of byName) {
      if (!expected.has(varName)) {
        report.orphans.push({ collection: COMPONENT_NAME, name: varName, id: variable.id });
      }
    }

    return { indexByPath, modeIds };
  }

  // ── Public entry ─────────────────────────────────────────────────────────────

  async function runSync(manifest) {
    if (!manifest || !manifest.tokens) {
      throw new Error('runSync: manifest.tokens missing');
    }

    const report = {
      created: [], updated: [], unchanged: [],
      skipped: [], errors: [], orphans: [],
      collections: {}, modes: {}
    };

    const prim = await ensureCollection(PRIMITIVE_NAME);
    const sem  = await ensureCollection(SEMANTIC_NAME);
    const comp = await ensureCollection(COMPONENT_NAME);
    report.collections.primitive = { id: prim.collection.id, name: prim.collection.name, created: prim.createdCollection };
    report.collections.semantic  = { id: sem.collection.id,  name: sem.collection.name,  created: sem.createdCollection };
    report.collections.component = { id: comp.collection.id, name: comp.collection.name, created: comp.createdCollection };

    // Detect primitive orphans before mutation so renames are visible.
    const primIndexByName = await indexCollectionByName(prim.collection);
    const primTokens = (manifest.tokens.primitive || []);
    const expectedPrim = new Set(primTokens.map((t) => t.name || nameFromPath(t.path)));
    for (const [varName, variable] of primIndexByName) {
      if (!expectedPrim.has(varName)) {
        report.orphans.push({ collection: PRIMITIVE_NAME, name: varName, id: variable.id });
      }
    }

    const primIndex = await syncPrimitives(manifest, prim.collection, report);
    const { indexByPath: semIndex, modeIds } = await syncSemantics(manifest, sem.collection, primIndex, report);
    const mergedIndex = Object.assign({}, primIndex, semIndex);
    const { indexByPath: compIndex, modeIds: componentModeIds } = await syncComponents(
      manifest,
      comp.collection,
      mergedIndex,
      report
    );

    report.modes.semantic = {
      Light: modeIds.Light, Dark: modeIds.Dark, Default: modeIds.Default
    };
    report.modes.component = {
      Light: componentModeIds.Light, Dark: componentModeIds.Dark, Default: componentModeIds.Default
    };
    report.summary = {
      created: report.created.length,
      updated: report.updated.length,
      unchanged: report.unchanged.length,
      skipped: report.skipped.length,
      errors: report.errors.length,
      orphans: report.orphans.length,
      primitives: Object.keys(primIndex).length,
      semantics: Object.keys(semIndex).length,
      components: Object.keys(compIndex).length
    };

    return report;
  }

  // ── Reverse sync (Figma Variables → manifest-shaped JSON) ───────────────────
  //
  // p6-4: read every variable from the three HDS collections back out and
  // emit the same shape `runSync` consumes — primitives carry concrete
  // values, semantics + components carry an alias path or a resolved
  // value (and an optional `dark` overlay when the collection has a Dark
  // mode). The bridge POSTs the result to `/tokens-from-figma`, which
  // validates and writes `tokens-from-figma.json` for human review. This
  // is the inverse of the existing forward path and never mutates the
  // canvas.

  function pathFromName(tier, varName) {
    // Inverse of nameFromPath: "color-neutral-50" → "primitive.color.neutral.50"
    const parts = String(varName || '').split('-').filter(Boolean);
    return [tier].concat(parts).join('.');
  }

  function rgbToHex(rgb) {
    if (!rgb || typeof rgb !== 'object') return null;
    const to255 = (n) => Math.max(0, Math.min(255, Math.round(n * 255)));
    const r = to255(rgb.r).toString(16).padStart(2, '0');
    const g = to255(rgb.g).toString(16).padStart(2, '0');
    const b = to255(rgb.b).toString(16).padStart(2, '0');
    const a = typeof rgb.a === 'number' && rgb.a < 1
      ? to255(rgb.a).toString(16).padStart(2, '0')
      : '';
    return '#' + r + g + b + a;
  }

  function figmaTypeToTokenType(resolvedType) {
    if (resolvedType === 'COLOR') return 'color';
    if (resolvedType === 'FLOAT') return 'dimension';
    return null;
  }

  function lookupVariableNameById(allVars, id) {
    for (const v of allVars) if (v.id === id) return v;
    return null;
  }

  function modeIdsFor(collection) {
    const modes = (collection && collection.modes) || [];
    let lightId = null;
    let darkId = null;
    let defaultId = null;
    for (const m of modes) {
      const lower = String(m.name || '').toLowerCase();
      if (lower === 'light') lightId = m.modeId;
      else if (lower === 'dark') darkId = m.modeId;
      else if (defaultId == null) defaultId = m.modeId;
    }
    if (lightId == null) lightId = defaultId != null ? defaultId : (modes[0] && modes[0].modeId);
    return { light: lightId, dark: darkId, default: defaultId };
  }

  function valueForMode(variable, modeId, allVars) {
    if (modeId == null) return null;
    const raw = variable.valuesByMode && variable.valuesByMode[modeId];
    if (raw == null) return null;
    if (typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
      const target = lookupVariableNameById(allVars, raw.id);
      if (!target) return null;
      const tier = collectionTierFromTarget(allVars, target);
      const aliasPath = tier ? pathFromName(tier, target.name) : target.name;
      return { alias: '{' + aliasPath + '}' };
    }
    if (variable.resolvedType === 'COLOR') {
      const hex = rgbToHex(raw);
      return hex ? { value: hex } : null;
    }
    if (variable.resolvedType === 'FLOAT') {
      return { value: typeof raw === 'number' ? raw : null };
    }
    return null;
  }

  // Resolve a variable's tier by looking at which HDS collection owns it.
  // Cached on the closure-shared map built inside runReverseSync; falls
  // back to `primitive` so an alias to a Figma variable outside our
  // managed collections still produces a usable path string for review.
  let _tierByCollectionId = null;
  function collectionTierFromTarget(_allVars, target) {
    if (!_tierByCollectionId || !target) return 'primitive';
    return _tierByCollectionId.get(target.variableCollectionId) || 'primitive';
  }

  async function runReverseSync() {
    if (!figma || !figma.variables) {
      throw new Error('runReverseSync: figma.variables unavailable in this context');
    }

    const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVars = await figma.variables.getLocalVariablesAsync();

    const wanted = {
      primitive: allCollections.find((c) => c.name === PRIMITIVE_NAME) || null,
      semantic:  allCollections.find((c) => c.name === SEMANTIC_NAME)  || null,
      component: allCollections.find((c) => c.name === COMPONENT_NAME) || null,
    };

    _tierByCollectionId = new Map();
    for (const tier of Object.keys(wanted)) {
      const c = wanted[tier];
      if (c) _tierByCollectionId.set(c.id, tier);
    }

    const out = {
      source: 'figma-variables',
      emittedAt: new Date().toISOString(),
      collections: {},
      tokens: { primitive: [], semantic: [], component: [] },
    };

    for (const tier of ['primitive', 'semantic', 'component']) {
      const collection = wanted[tier];
      if (!collection) continue;

      out.collections[tier] = {
        id: collection.id,
        name: collection.name,
        modes: (collection.modes || []).map((m) => ({ modeId: m.modeId, name: m.name })),
      };

      const modeIds = modeIdsFor(collection);

      for (const v of allVars) {
        if (v.variableCollectionId !== collection.id) continue;
        const tokenType = figmaTypeToTokenType(v.resolvedType);
        if (!tokenType) continue;

        const entry = {
          path: pathFromName(tier, v.name),
          type: tokenType,
        };

        const light = valueForMode(v, modeIds.light, allVars);
        if (light) {
          if ('alias' in light) entry.alias = light.alias;
          else if ('value' in light) entry.value = light.value;
        }

        if (modeIds.dark != null) {
          const dark = valueForMode(v, modeIds.dark, allVars);
          if (dark) entry.dark = dark;
        }

        if (v.description) entry.description = v.description;

        // Skip entries that resolved to nothing in Light — the writer
        // would reject them (TOKEN_VALUE_MISSING) and we'd rather omit
        // empty rows than block the round-trip on unset slots.
        if (entry.alias == null && entry.value === undefined) continue;

        out.tokens[tier].push(entry);
      }
    }

    return out;
  }

  const HDSSyncTokens = {
    runSync,
    runReverseSync,
    _internals: {
      parseColor, oklchToRgb, hexToRgb, parseDimension,
      nameFromPath, pathFromName, stripBraces, colorsEqual, rgbToHex,
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HDSSyncTokens;
  } else if (root) {
    root.HDSSyncTokens = HDSSyncTokens;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
