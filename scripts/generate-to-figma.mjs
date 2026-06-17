#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */

import fs from 'fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runWithRetry } from '../pipeline/retry-loop.mjs';

const MANIFEST_PATH = path.join(process.cwd(), 'public/hds-manifest.json');
const BRIDGE_URL = process.env.HDS_FIGMA_BRIDGE_URL || 'http://localhost:3005/generate';
const SELECTION_URL = 'http://localhost:3005/selection';
const LLM_API_URL = process.env.HDS_LLM_API_URL || 'http://localhost:11434/v1/chat/completions';
const LLM_MODEL = process.env.HDS_LLM_MODEL || 'hermes3';
const TEMPERATURE = Number(process.env.HDS_LLM_TEMPERATURE || 0.2);
// JSON mode is the primary output format: Ollama grammar-enforces valid JSON at
// the token level, eliminating markdown fences and prose. The stream parser
// extracts result.jsx from the envelope before passing to the JSX compiler.
// Override via HDS_LLM_FORMAT="" to disable (not recommended for hermes3).
const LLM_FORMAT = process.env.HDS_LLM_FORMAT !== undefined ? process.env.HDS_LLM_FORMAT : 'json';

function usage() {
  console.error('Usage: pnpm ui:gen "A login form"');
  console.error('       pnpm ui:fix "Make it dark mode"  (requires Figma selection)');
  console.error('');
  console.error('Optional env:');
  console.error('  HDS_LLM_API_URL=http://localhost:11434/v1/chat/completions');
  console.error('  HDS_LLM_MODEL=hds-coder          (or qwen2.5-coder:7b-instruct, hermes3, llama3.1:8b)');
  console.error('  HDS_LLM_FORMAT=json               (default: json — grammar-enforced JSON envelope; set to "" to disable)');
  console.error('  HDS_FIGMA_BRIDGE_URL=http://localhost:3005/generate');
}

async function readManifest() {
  const source = await fsPromises.readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(source);
}

function summarizeManifest(manifest) {
  const componentSpecs = manifest.componentSpecs || {};
  const components = Object.entries(componentSpecs).map(([name, spec]) => ({
    name,
    category: spec.category,
    description: spec.description,
    props: spec.props || {},
    figmaPropertyMapping: spec.figmaPropertyMapping || undefined,
    tokens: spec.tokens || spec.tokenMapping || undefined,
  }));

  const tokens = Object.fromEntries(
    Object.entries(manifest.tokens || {}).map(([tier, entries]) => [
      tier,
      Array.isArray(entries)
        ? entries.map((token) => ({
            path: token.path,
            type: token.type,
            value: token.resolvedValue || token.value || token.alias,
          }))
        : [],
    ]),
  );

  return {
    name: manifest.name,
    version: manifest.version,
    brand: manifest.brand,
    componentInventory: manifest.componentInventory || components.map((component) => component.name),
    components,
    tokens,
    typographyRamp: manifest.typographyRamp?.tokens || [],
  };
}

function buildComponentReference(components, componentInventory) {
  const lines = [];

  lines.push('Layout primitives (Figma frames and text nodes):');
  lines.push('- <HdsFrame layout="VERTICAL|HORIZONTAL" fill="token" stroke="token" padding="N" gap="N" radius="N" width="N" height="N">');
  lines.push('- <Text typography="token" fill="token">text content</Text>');
  lines.push('- <Icon name="ph:icon-bold" size="N" fill="token" />');

  const specsWithProps = components.filter((c) => Object.keys(c.props).length > 0);
  if (specsWithProps.length > 0) {
    lines.push('\nHDS Components with validated props:');
    for (const c of specsWithProps) {
      const propParts = Object.entries(c.props)
        .filter(([, v]) => v.type === 'enum' || v.type === 'boolean' || v.type === 'string')
        .map(([k, v]) => {
          if (v.type === 'enum') return `${k}="${v.values.join('|')}"`;
          if (v.type === 'boolean') return `${k}={bool}`;
          return `${k}="string"`;
        });
      lines.push(`- <${c.name}${propParts.length ? ' ' + propParts.join(' ') : ''} />`);
    }
  }

  const specNames = new Set(specsWithProps.map((c) => c.name));
  const primitiveNames = new Set(['HdsFrame', 'Text', 'Icon']);
  const unlisted = componentInventory.filter((n) => !specNames.has(n) && !primitiveNames.has(n));
  if (unlisted.length > 0) {
    lines.push('\nAdditional available components (use without prop constraints):');
    lines.push(unlisted.join(', '));
  }

  return lines.join('\n');
}

function buildSystemPrompt(manifest) {
  const context = summarizeManifest(manifest);
  const componentRef = buildComponentReference(context.components, context.componentInventory);
  const validNames = ['HdsFrame', 'Text', 'Icon', ...context.componentInventory].join(', ');

  return `You are a UI generator. Output ONLY a JSON object with one key "jsx". Its value is an HDS JSX string.

REQUIRED OUTPUT FORMAT — nothing before { and nothing after }:
{"jsx":"<HdsFrame layout=\\"VERTICAL\\" fill=\\"semantic.color.surface.raised\\" padding=\\"24\\" gap=\\"16\\" radius=\\"8\\"><Text typography=\\"semantic.typography.h3\\" fill=\\"semantic.color.content.primary\\">Title</Text></HdsFrame>"}

BINDING RULES — each violation breaks the render pipeline:
1. First character MUST be {. Last character MUST be }.
2. The "jsx" value MUST use ONLY these component names: ${validNames}
3. BANNED HTML elements: div, span, p, h1, h2, h3, h4, h5, h6, input, button, form, label, ul, li, section, header, footer, article, nav, main, aside, table, tr, td, th, img, a. Any of these = fatal error.
4. BANNED content: Bootstrap classes, Tailwind classes, CSS properties, raw hex colors (#fff, #000), raw rgb(), raw px values (16px).
5. Every fill/stroke/typography/radius value MUST be a semantic token path string.
6. All double-quotes inside the jsx string MUST be escaped as \\".

STYLE CANON — every output must conform; the validator rejects violations and triggers automatic retry:
- Headings use semantic.typography.h2 / h3 (font-light / font-normal). Never bold anywhere.
- Body emphasis uses semantic.typography.bodyEmphasis (font-medium, weight 500). Never bold.
- Drive color hierarchy with opacity (content.primary / .secondary / .tertiary). Never use a second hue for hierarchy. No purple, indigo, violet, fuchsia.
- One accent per layout (default semantic.color.accent.primary). No gradients on surfaces.
- Spacing on the 8px grid: padding/gap from {0, 4, 8, 16, 24, 32, 48, 64}. Section padding minimum 16.
- Surfaces: semantic.color.surface.{raised,page,dark,overlay}. Never bg-white, bg-black, or raw hex.
- Structural radius: semantic.radius.action (4) or .card (8) on frames, cards, inputs. Pill radius only on Badge.
- Body width capped at 60ch. Layouts span full width via grid, never via stretched prose.
- Typographic details: use "…" not "...", and curly quotes in body copy.
- Realistic copy only — no lorem ipsum. If unspecified, write plausible domain copy ("Email address", "Save changes").
- Layout defaults to bands, dividers, rails, disclosures, whitespace. Repeated outlined cards only for genuinely discrete repeated objects.
- Every data-rendering Frame has empty/loading/error copy; every async surface has a loading state.

COMPLETE EXAMPLE — login form:
{"jsx":"<HdsFrame layout=\\"VERTICAL\\" fill=\\"semantic.color.surface.raised\\" padding=\\"32\\" gap=\\"20\\" radius=\\"8\\"><Text typography=\\"semantic.typography.h3\\" fill=\\"semantic.color.content.primary\\">Sign in</Text><Input placeholder=\\"Email address\\" type=\\"email\\" /><Input placeholder=\\"Password\\" type=\\"password\\" /><HdsButton variant=\\"primary\\">Login</HdsButton></HdsFrame>"}

COMPLETE EXAMPLE — nav header:
{"jsx":"<HdsFrame layout=\\"HORIZONTAL\\" fill=\\"semantic.color.surface.page\\" padding=\\"16\\" gap=\\"24\\"><Text typography=\\"semantic.typography.small\\" fill=\\"semantic.color.content.primary\\">Dashboard</Text><Text typography=\\"semantic.typography.small\\" fill=\\"semantic.color.content.secondary\\">Projects</Text><HdsButton variant=\\"secondary\\">New</HdsButton></HdsFrame>"}

COMPLETE EXAMPLE — settings table (compose tables as flat HdsFrames + Text, not table primitives):
{"jsx":"<HdsFrame layout=\\"VERTICAL\\" fill=\\"semantic.color.surface.raised\\" padding=\\"24\\" gap=\\"0\\" radius=\\"8\\" stroke=\\"semantic.color.border.default\\"><HdsFrame layout=\\"HORIZONTAL\\" padding=\\"16\\" gap=\\"24\\" stroke=\\"semantic.color.border.default\\"><Text typography=\\"semantic.typography.caption\\" fill=\\"semantic.color.content.tertiary\\">Setting</Text><Text typography=\\"semantic.typography.caption\\" fill=\\"semantic.color.content.tertiary\\">Value</Text></HdsFrame><HdsFrame layout=\\"HORIZONTAL\\" padding=\\"16\\" gap=\\"24\\" stroke=\\"semantic.color.border.default\\"><Text typography=\\"semantic.typography.body\\" fill=\\"semantic.color.content.primary\\">Notifications</Text><Text typography=\\"semantic.typography.body\\" fill=\\"semantic.color.content.secondary\\">Enabled</Text></HdsFrame><HdsFrame layout=\\"HORIZONTAL\\" padding=\\"16\\" gap=\\"24\\" stroke=\\"semantic.color.border.default\\"><Text typography=\\"semantic.typography.body\\" fill=\\"semantic.color.content.primary\\">Theme</Text><Text typography=\\"semantic.typography.body\\" fill=\\"semantic.color.content.secondary\\">System</Text></HdsFrame><HdsFrame layout=\\"HORIZONTAL\\" padding=\\"16\\" gap=\\"24\\"><Text typography=\\"semantic.typography.body\\" fill=\\"semantic.color.content.primary\\">Language</Text><Text typography=\\"semantic.typography.body\\" fill=\\"semantic.color.content.secondary\\">English</Text></HdsFrame></HdsFrame>"}

HDS COMPONENT REFERENCE (from hds-manifest.json):
${componentRef}

DESIGN TOKEN PATHS (use for fill, stroke, typography, radius — never raw hex or px):
Colors: semantic.color.surface.raised | .page | .action | .dark | .overlay
Content: semantic.color.content.primary | .secondary | .tertiary | .onAction
Border: semantic.color.border.default | .strong
Typography: semantic.typography.display | .h1 | .h2 | .h3 | .body | .small | .caption | .mono
Radius: semantic.radius.action | .card | .pill
Space: semantic.space.component.padding | semantic.space.layout.tight | .comfortable`;
}

function parseStreamPayload(data) {
  if (!data || data === '[DONE]') {
    return { done: data === '[DONE]', content: '' };
  }

  try {
    const payload = JSON.parse(data);
    const choice = payload.choices?.[0];

    return {
      done: Boolean(choice?.finish_reason),
      content:
        choice?.delta?.content ||
        choice?.message?.content ||
        choice?.text ||
        payload.response ||
        '',
    };
  } catch {
    return { done: false, content: '' };
  }
}

function isValidCommand(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.action === 'ADD_NODE') return Boolean(parsed.id && parsed.type);
  if (parsed.action === 'UPDATE_NODE') return Boolean(parsed.id);
  return false;
}

// String-aware brace-counting extractor.
// Walks the buffer character by character, ignoring everything outside top-level
// `{...}` regions (markdown fences, prose, array brackets, whitespace, etc.).
// Returns an array of complete candidate JSON object strings plus any trailing
// remainder that has not yet closed (so the next stream chunk can complete it).
function extractJsonObjects(buffer) {
  const objects = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const start = buffer.indexOf('{', cursor);
    if (start === -1) {
      // No further objects begin in this buffer — discard non-JSON noise.
      return { objects, remainder: '' };
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let i = start; i < buffer.length; i += 1) {
      const ch = buffer[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      // Object is still streaming in — preserve it for the next flush.
      return { objects, remainder: buffer.slice(start) };
    }

    objects.push(buffer.slice(start, end + 1));
    cursor = end + 1;
  }

  return { objects, remainder: '' };
}

async function postNode(node) {
  const response = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: `${JSON.stringify(node)}\n`,
  });

  const body = await response.text();

  if (!response.ok && response.status !== 207) {
    throw new Error(`Bridge request failed: ${response.status} ${response.statusText}: ${body}`);
  }

  try {
    const result = JSON.parse(body);
    return Number(result.accepted || 0) > 0;
  } catch {
    return response.ok;
  }
}

// ── p6-5: fix-mode structural diff ──────────────────────────────────────────
//
// The LLM proposal is a flat array of UPDATE_NODE / ADD_NODE / REMOVE_NODE
// commands keyed by Figma node id. Posting them wholesale re-stamps every
// node in the selection — wasteful and lossy when the model echoes a prop it
// did not intend to change. diffCommands() compares each proposed UPDATE
// against the serialized selection (from p6-1) and emits only the props
// that actually differ. ADD/REMOVE commands flow through with light sanity
// checks (don't ADD an id that already exists; don't REMOVE one that doesn't).
//
// This is a pure function — exported for fixture tests in
// `fixtures/fix-mode-diff/` and consumed by fixGenerate() at runtime.

export function flattenSelection(tree) {
  const map = new Map();
  if (!Array.isArray(tree)) return map;
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || !node.id) continue;
    map.set(node.id, node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) stack.push(child);
    }
  }
  return map;
}

// Resolve the current value of `propKey` on a serialized selection node.
// Token-bound props (fill, stroke, typography, radius, …) live under
// `tokenPaths`; geometric / structural props live at the node root.
// Anything we can't resolve returns `undefined`, which forces the diff to
// keep the proposed change (fail-safe — better to over-emit than to drop a
// real edit on incomplete metadata).
export function getCurrentPropValue(node, propKey) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.tokenPaths && Object.prototype.hasOwnProperty.call(node.tokenPaths, propKey)) {
    return node.tokenPaths[propKey];
  }
  if (Object.prototype.hasOwnProperty.call(node, propKey)) {
    return node[propKey];
  }
  // Common aliases between the LLM's prop vocabulary and Figma's API /
  // serialized selection shape (singular ↔ plural arrays, radius ↔ cornerRadius).
  const aliases = {
    radius: 'cornerRadius',
    cornerRadius: 'radius',
    itemSpacing: 'gap',
    gap: 'itemSpacing',
    fill: 'fills',
    stroke: 'strokes',
  };
  const alias = aliases[propKey];
  if (!alias) return undefined;
  // tokenPaths.fills / tokenPaths.strokes serialize as arrays — collapse to
  // the first element so a singular proposal can match a singular slot.
  if (node.tokenPaths && Object.prototype.hasOwnProperty.call(node.tokenPaths, alias)) {
    const v = node.tokenPaths[alias];
    if (Array.isArray(v)) return v[0] ?? undefined;
    return v;
  }
  if (Object.prototype.hasOwnProperty.call(node, alias)) {
    return node[alias];
  }
  return undefined;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}

export function diffCommands(selectionTree, proposedCommands) {
  const selection = flattenSelection(selectionTree);
  const result = [];
  const addedIds = new Set();
  if (!Array.isArray(proposedCommands)) return result;

  for (const cmd of proposedCommands) {
    if (!cmd || typeof cmd !== 'object' || !cmd.action) continue;

    if (cmd.action === 'ADD_NODE') {
      // Drop ADDs that collide with the current tree — the bridge would
      // reject them anyway, and the LLM should be UPDATE-ing instead.
      if (!cmd.id || selection.has(cmd.id) || addedIds.has(cmd.id)) continue;
      addedIds.add(cmd.id);
      result.push(cmd);
      continue;
    }

    if (cmd.action === 'REMOVE_NODE') {
      // Only emit removals for nodes that actually exist in the selection.
      if (!cmd.id || !selection.has(cmd.id)) continue;
      result.push(cmd);
      continue;
    }

    if (cmd.action === 'UPDATE_NODE') {
      if (!cmd.id) continue;
      const node = selection.get(cmd.id);
      // UPDATE on a node that isn't in the selection: pass through (the
      // bridge will validate). Never silently drop edits on missing data.
      if (!node) { result.push(cmd); continue; }

      const proposedProps = cmd.props && typeof cmd.props === 'object' ? cmd.props : {};
      const changedProps = {};
      let changedCount = 0;

      for (const [key, value] of Object.entries(proposedProps)) {
        const current = getCurrentPropValue(node, key);
        if (!valuesEqual(current, value)) {
          changedProps[key] = value;
          changedCount += 1;
        }
      }

      // No-op: every proposed prop already matches the current node.
      if (changedCount === 0) continue;

      result.push({ ...cmd, props: changedProps });
      continue;
    }
  }

  return result;
}

async function flushBuffer(state, counters, sink) {
  const { objects, remainder } = extractJsonObjects(state.commandBuffer);
  state.commandBuffer = remainder;

  for (const candidate of objects) {
    let obj;
    try {
      obj = JSON.parse(candidate);
    } catch {
      counters.skipped += 1;
      continue;
    }

    // Hoist type out of props if the model placed it there
    if (obj.action === 'ADD_NODE' && !obj.type && obj.props && obj.props.type) {
      obj.type = obj.props.type;
      delete obj.props.type;
    }

    if (!isValidCommand(obj)) {
      console.log("\n❌ REJECTED OBJECT:", JSON.stringify(obj, null, 2));
      counters.skipped += 1;
      continue;
    }

    // sink: 'collect' buffers commands for downstream diff/post; default
    // posts directly so legacy gen mode behaviour is unchanged.
    if (sink && sink.collected) {
      sink.collected.push(obj);
      counters.forwarded += 1;
      continue;
    }

    if (await postNode(obj)) {
      counters.forwarded += 1;
      process.stdout.write('.');
    } else {
      counters.skipped += 1;
    }
  }
}

async function processStreamLine(streamLine, state, counters, sink) {
  const line = streamLine.trim();
  if (!line || line === 'data: [DONE]' || line.startsWith(':') || line.startsWith('event:')) return;

  if (line.startsWith('data:')) {
    const { content } = parseStreamPayload(line.slice(5).trim());
    if (!content) return;
    state.commandBuffer += content;
    state.fullResponse += content;
    await flushBuffer(state, counters, sink);
  }
  // Non-SSE lines are discarded — never feed raw HTTP text into the JSON parser.
}

function buildFixSystemPrompt(manifest, selectionTree) {
  const context = summarizeManifest(manifest);
  const firstNode = selectionTree[0] || { id: '1:2', name: 'Frame', type: 'FRAME' };

  return `You are a headless Figma editor. Output ONLY a raw JSON array of UPDATE_NODE or ADD_NODE commands. NO markdown code blocks. NO conversational text. NO explanations. If you write anything other than JSON, the system will crash.

FATAL CONSTRAINT — READ THIS BEFORE GENERATING A SINGLE CHARACTER:
The very first character of your response MUST be "[" or "{". If it is anything else — a letter, a backtick, a space, a newline with text — the entire pipeline aborts and nothing is updated. You will have failed.

BANNED OUTPUT (any of these = total failure):
- Markdown fences: \`\`\` \`\`\`json
- Any word before the JSON: "Here", "Sure", "To change", "You need", "In this"
- Explanations or prose before or after the JSON
- Comments inside JSON: // or /* */
- Wrong JSON schema (theme objects, color maps, config objects)

REQUIRED — one format only, nothing else:
UPDATE_NODE — edit an existing Figma node by its exact id:
{"action":"UPDATE_NODE","id":"<figma-node-id>","props":{}}

ADD_NODE — append a new node (parents before children):
{"action":"ADD_NODE","id":"<new-unique-id>","parentId":"<parent-id>","type":"FRAME|TEXT","props":{}}

Props use semantic token paths for fill, stroke, radius, padding, typography, itemSpacing, cornerRadius.
Only emit commands for nodes that actually need changing.

CRITICAL — fill must be a token path string, NEVER a fills array:
✅ CORRECT: "fill":"semantic.color.surface.dark"
❌ WRONG:   "fills":[{"type":"SOLID","color":{"r":0,"g":0,"b":0}}]
Never use fills arrays. Never use raw RGB. Always use semantic token path strings.

FEW-SHOT EXAMPLE — change card background to dark surface (use this exact structure):
[{"action":"UPDATE_NODE","id":"${firstNode.id}","props":{"fill":"semantic.color.surface.dark"}}]

FEW-SHOT EXAMPLE — change fill + radius:
[{"action":"UPDATE_NODE","id":"${firstNode.id}","props":{"fill":"semantic.color.surface.raised","radius":"semantic.radius.action"}}]

ONE FORMAT ONLY — a raw JSON array starting with "[". Nothing before it. Nothing after it.

Available token paths (use these for props):
${JSON.stringify(context.tokens, null, 2)}`;
}

async function callLlmNonStreaming(systemPrompt, userMessage) {
  const response = await fetch(LLM_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      temperature: TEMPERATURE,
      max_tokens: 4096,
      options: { num_ctx: 8192 },
      ...(LLM_FORMAT ? { format: LLM_FORMAT } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}: ${body}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
}

async function gatekeeperPath(systemPrompt, userPrompt) {
  console.log(`[gatekeeper] Generating UI via retry loop (model: "${LLM_MODEL}")...`);

  const result = await runWithRetry({
    callLlm: (prompt) => callLlmNonStreaming(systemPrompt, prompt),
    userPrompt,
    source: 'pipeline',
  });

  if (!result.ok) {
    console.error(`\n[gatekeeper] Validation failed after ${result.attempts} attempt(s).`);
    for (const err of result.errors) {
      const hint = err.suggestion ? ` — ${err.suggestion}` : '';
      console.error(`  [${err.code}] ${err.message}${hint}`);
    }
    return;
  }

  console.log(`\n[gatekeeper] JSX valid (${result.attempts} attempt(s)). Compiling...`);

  const { compile } = await import('./hds-jsx-compiler.mjs');
  const commands = compile(result.jsx);
  const counters = { forwarded: 0, skipped: 0 };

  for (const cmd of commands) {
    if (await postNode(cmd)) {
      counters.forwarded += 1;
      process.stdout.write('.');
    } else {
      counters.skipped += 1;
    }
  }

  console.log(`\nDone. Forwarded ${counters.forwarded} node(s).`);
  if (counters.skipped > 0) {
    console.log(`Skipped ${counters.skipped} object(s).`);
  }
}

async function legacyStreamPath(systemPrompt, userPrompt, options = {}) {
  const { collect = false } = options;
  console.log(`Generating Figma UI from local model "${LLM_MODEL}"...`);

  const response = await fetch(LLM_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: TEMPERATURE,
      max_tokens: 4096,
      options: { num_ctx: 8192 },
      ...(LLM_FORMAT ? { format: LLM_FORMAT } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local model request failed: ${response.status} ${response.statusText}: ${body}`);
  }

  if (!response.body) {
    throw new Error('Local model response did not include a stream body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const counters = { forwarded: 0, skipped: 0 };
  const state = {
    streamBuffer: '',
    commandBuffer: '',
    fullResponse: '',
  };
  const sink = collect ? { collected: [] } : null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    state.streamBuffer += chunk;
    const streamLines = state.streamBuffer.split(/\r?\n/);
    state.streamBuffer = streamLines.pop() || '';

    for (const streamLine of streamLines) {
      await processStreamLine(streamLine, state, counters, sink);
    }
  }

  const finalChunk = decoder.decode();
  state.streamBuffer += finalChunk;
  if (state.streamBuffer.trim()) {
    await processStreamLine(state.streamBuffer, state, counters, sink);
  }

  // Final drain — anything still in commandBuffer that closed at the very end.
  await flushBuffer(state, counters, sink);

  if (collect) {
    // Fix-mode caller wants the raw LLM commands so it can run the diff
    // before posting. Skip JSX-fallback compilation — fix mode operates on
    // existing nodes, never on freshly compiled JSX trees.
    return { commands: sink.collected, fullResponse: state.fullResponse };
  }

  console.log("\n🤖 RAW LLM OUTPUT (content only):\n", state.fullResponse);

  // JSX extraction: prefer JSON envelope (LLM_FORMAT=json path), fall back to
  // raw markup scan if the model dropped the envelope or JSON mode was off.
  if (counters.forwarded === 0) {
    let jsxSource = null;

    try {
      const envelope = JSON.parse(state.fullResponse.trim());
      jsxSource = envelope.jsx ?? envelope.code ?? envelope.html ?? envelope.component ?? envelope.output ?? null;
      if (jsxSource) console.log('\n[json-envelope] Extracted jsx from JSON response.');
    } catch {
      // Not valid JSON — fall through to raw markup scan
    }

    if (!jsxSource && /<[A-Za-z]/.test(state.fullResponse)) {
      jsxSource = state.fullResponse;
    }

    if (jsxSource) {
      const { compile } = await import('./hds-jsx-compiler.mjs');
      const jsxCommands = compile(jsxSource);
      if (jsxCommands.length > 0) {
        console.log(`\n[jsx-compiler] Compiled ${jsxCommands.length} node(s) — forwarding...`);
        for (const cmd of jsxCommands) {
          if (await postNode(cmd)) {
            counters.forwarded += 1;
            process.stdout.write('.');
          } else {
            counters.skipped += 1;
          }
        }
      } else {
        console.log('\n[jsx-compiler] No recognisable markup found in LLM output.');
      }
    }
  }

  console.log(`\nDone. Forwarded ${counters.forwarded} node${counters.forwarded === 1 ? '' : 's'}.`);
  if (counters.skipped > 0) {
    console.log(`Skipped ${counters.skipped} non-schema object${counters.skipped === 1 ? '' : 's'}.`);
  }
  return undefined;
}

async function generate(prompt, options = {}) {
  const manifest = await readManifest();
  const systemPrompt = buildSystemPrompt(manifest);

  // --output-jsx-only: call LLM, extract JSX, print to stdout, exit.
  // Does NOT post to the Figma bridge. Used by test-prompt-regression.mjs.
  if (options.outputJsxOnly) {
    const raw = await callLlmNonStreaming(systemPrompt, prompt);
    let jsx = null;

    // Use extractJsonObjects to handle prose-trailing responses where raw JSON
    // is followed by an explanation paragraph (a known Hermes3 quirk).
    const { objects } = extractJsonObjects(raw);
    for (const candidate of objects) {
      try {
        const envelope = JSON.parse(candidate);
        const extracted = envelope.jsx ?? envelope.code ?? envelope.html ?? envelope.component ?? envelope.output ?? null;
        if (extracted) { jsx = extracted; break; }
      } catch {
        // skip non-parseable candidates
      }
    }

    // Fall back to raw markup scan if no JSON envelope found
    if (!jsx && /<[A-Za-z]/.test(raw)) {
      jsx = raw;
    }

    if (!jsx) {
      process.stderr.write('[output-jsx-only] Could not extract JSX from LLM response\n');
      process.exit(1);
    }
    process.stdout.write(jsx);
    return;
  }

  const bridgeConfig = JSON.parse(fs.readFileSync(
    new URL('../bridge.config.json', import.meta.url), 'utf8'
  ));
  if (bridgeConfig.retryLoopEnabled) {
    return gatekeeperPath(systemPrompt, prompt);
  }
  return legacyStreamPath(systemPrompt, prompt);
}

async function fixGenerate(prompt) {
  const manifest = await readManifest();
  let selection;
  try {
    const res = await fetch(SELECTION_URL);
    selection = await res.json();
  } catch {
    console.error('Could not reach bridge at ' + SELECTION_URL + '. Is the bridge running?');
    process.exit(1);
  }

  const tree = selection && selection.tree;
  if (!tree || tree.length === 0) {
    console.error('No selection found on the bridge. Select nodes in Figma first, then run pnpm ui:fix.');
    process.exit(1);
  }

  console.log(`Fix mode: ${tree.length} node(s) in selection.`);
  const systemPrompt = buildFixSystemPrompt(manifest, tree);
  const userMessage = `Selected Figma nodes (use these exact ids in UPDATE_NODE commands):
${JSON.stringify(tree, null, 2)}

Task: ${prompt}`;

  // p6-5: collect the LLM proposal first, then diff against the live
  // selection, then post only the deltas. Bypassing the in-stream forward
  // is intentional — without diffing, every echoed prop re-stamps the node.
  const result = await legacyStreamPath(systemPrompt, userMessage, { collect: true });
  const proposed = (result && result.commands) || [];
  const patch = diffCommands(tree, proposed);

  console.log(
    `\n[fix-diff] LLM proposed ${proposed.length} command(s); patch contains ${patch.length} after diff.`,
  );

  if (patch.length === 0) {
    console.log('[fix-diff] Selection already matches the proposal — nothing to send.');
    return;
  }

  let forwarded = 0;
  let skipped = 0;
  for (const cmd of patch) {
    if (await postNode(cmd)) {
      forwarded += 1;
      process.stdout.write('.');
    } else {
      skipped += 1;
    }
  }

  console.log(`\nDone. Forwarded ${forwarded} patch command${forwarded === 1 ? '' : 's'}.`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} command${skipped === 1 ? '' : 's'}.`);
  }
}

const rawArgs = process.argv.slice(2);
const fixMode = rawArgs.includes('--fix');
const outputJsxOnly = rawArgs.includes('--output-jsx-only');
const userPrompt = rawArgs
  .filter((a) => a !== '--fix' && a !== '--output-jsx-only')
  .join(' ')
  .trim();

if (!userPrompt) {
  usage();
  process.exit(1);
}

const runner = fixMode ? fixGenerate : (p) => generate(p, { outputJsxOnly });
runner(userPrompt).catch((error) => {
  console.error(`\nFailed to generate UI: ${error.message}`);
  process.exit(1);
});
