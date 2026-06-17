/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * video-clone.mjs — Video → analyzed motion graphics + HDS-compliant React with motion/react
 *
 * Usage:
 *   node scripts/video-clone.mjs <video-path> [--output <path>] [--frame-stride <n>] [--max-frames <n>] [--help]
 *
 * Steps:
 *   1. Verify ffmpeg is available
 *   2. Extract N frames at requested stride → public/assets/_incoming/video-clone-[timestamp]-frame-%04d.png
 *   3. Base64 keyframes + Claude API vision → identifies motion patterns → outputs HDS React TSX with motion/react
 *   4. Write TSX → public/assets/_incoming/video-clone-[timestamp]-motion.tsx
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const INCOMING_DIR = path.resolve(REPO_ROOT, 'public/assets/_incoming');
const LLMS_TXT = path.resolve(REPO_ROOT, 'public/llms.txt');

// ── CLI parsing ──────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
video-clone — Video → AI motion analysis → HDS-compliant React + motion/react

Usage:
  node scripts/video-clone.mjs <video-path> [options]

Arguments:
  <video-path>           Path to the video file to analyze

Options:
  --output <path>        Custom output path for the .tsx file (default: public/assets/_incoming/)
  --frame-stride <n>     Extract every nth second as a keyframe (default: 2)
  --max-frames <n>       Maximum number of frames to extract and send to AI (default: 8)
  --help, -h             Print this help message and exit

Examples:
  node scripts/video-clone.mjs ./demo.mp4
  node scripts/video-clone.mjs ./demo.mp4 --frame-stride 1 --max-frames 12
  node scripts/video-clone.mjs ./demo.mp4 --output src/app/pages/MotionDemo.tsx
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    videoPath: null,
    output: null,
    frameStride: 2,
    maxFrames: 8,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--output') {
      i++;
      if (!args[i]) {
        console.error('Error: --output requires a path argument');
        process.exit(1);
      }
      opts.output = args[i];
    } else if (arg === '--frame-stride') {
      i++;
      const n = parseInt(args[i], 10);
      if (Number.isNaN(n) || n < 1) {
        console.error('Error: --frame-stride requires a positive integer');
        process.exit(1);
      }
      opts.frameStride = n;
    } else if (arg === '--max-frames') {
      i++;
      const n = parseInt(args[i], 10);
      if (Number.isNaN(n) || n < 1) {
        console.error('Error: --max-frames requires a positive integer');
        process.exit(1);
      }
      opts.maxFrames = n;
    } else if (!arg.startsWith('--')) {
      opts.videoPath = arg;
    } else {
      console.error(`Error: unknown flag "${arg}". Run --help for usage.`);
      process.exit(1);
    }
    i++;
  }

  return opts;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}


// ── Step 1: Verify ffmpeg ────────────────────────────────────────────────────

async function verifyFfmpeg() {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error('ffmpeg not found or not executable'));
      }
    });
    proc.on('error', () => {
      reject(new Error('ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.'));
    });
  });
}

// ── Step 2: Frame extraction ─────────────────────────────────────────────────

async function extractFrames(videoPath, outDir, stride, maxFrames) {
  console.log(`[video-clone] Extracting frames from: ${videoPath}`);
  console.log(`[video-clone] Stride: every ${stride}s, max frames: ${maxFrames}`);

  const baseName = `video-clone-${timestamp()}`;
  const pattern = path.join(outDir, `${baseName}-frame-%04d.png`);

  // ffmpeg: extract one frame every stride seconds, limit to maxFrames
  const args = [
    '-i', videoPath,
    '-vf', `fps=1/${stride}`,
    '-frames:v', String(maxFrames),
    '-y',
    pattern,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      // Collect resulting frame paths
      const framePrefix = `${baseName}-frame-`;
      readdir(outDir).then((files) => {
        const frames = files
          .filter((f) => f.startsWith(framePrefix) && f.endsWith('.png'))
          .sort()
          .map((f) => path.join(outDir, f));
        resolve({ baseName, frames });
      }).catch(reject);
    });
    proc.on('error', reject);
  });
}

// ── Step 3: Claude API vision analysis ───────────────────────────────────────

async function loadLlmsTxt() {
  try {
    return await readFile(LLMS_TXT, 'utf8');
  } catch {
    return '(public/llms.txt not found — using fallback component list)';
  }
}

function buildSystemPrompt(llmsTxt) {
  return `You are an expert front-end motion designer and engineer building UI for the Hirobius Design System (HDS).

You will receive a sequence of keyframes extracted from a video. Your task is to:
1. Analyze the motion patterns, transitions, and animation behaviors visible across the keyframes
2. Identify the visual components and layout zones involved in the motion
3. Reconstruct the observed motion as HDS-compliant React TypeScript using motion/react primitives
4. Use HDS tokens for all durations, easings, colors, spacing, and typography

## HDS System Context

${llmsTxt}

## HDS Motion Tokens (use these — never raw milliseconds or CSS cubic-bezier strings)

- Productive (quick, legible): \`hds.motion.productive.duration\` + \`hds.motion.productive.easing\`
- Expressive (deliberate, teaching): \`hds.motion.expressive.duration\` + \`hds.motion.expressive.easing\`
- Spatial (viewport travel): \`hds.motion.spatial.duration\` + \`hds.motion.spatial.easing\`
- Exit (calm removal): \`hds.motion.exit.duration\` + \`hds.motion.exit.easing\`

Duration steps:
- instant = 100ms
- short = 150ms
- medium = 250ms
- long = 400ms

Easing curves:
- emphasized: [0.4, 0, 0.2, 1]
- decelerate: [0, 0, 0.2, 1]
- accelerate: [0.4, 0, 1, 1]
- elastic: spring(300, 20, 1)

## motion/react API patterns (use these exactly)

Import:
\`\`\`tsx
import { motion, AnimatePresence } from 'motion/react';
\`\`\`

Common patterns:
- Entry: \`<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: hds.motion.productive.duration, ease: hds.motion.productive.easing }} />\`
- Exit: \`<motion.div exit={{ opacity: 0, y: -8 }} transition={{ duration: hds.motion.exit.duration, ease: hds.motion.exit.easing }} />\`
- Scale entry: \`initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}\`
- Hover: \`whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}\`
- Drag: \`<motion.div drag dragConstraints={{ left: -100, right: 100, top: -100, bottom: 100 }} />\`
- Layout: \`<motion.div layout transition={{ duration: hds.motion.expressive.duration, ease: hds.motion.expressive.easing }} />\`
- Stagger children via \`transition={{ staggerChildren: 0.05 }}\` on parent
- AnimatePresence for mount/unmount: wrap conditional renders
- Key-driven loops: use \`animate={{ x: [0, 56, 0] }} transition={{ repeat: Infinity, duration: ... }}\`

## Component Palette (use these, do not invent new components)

Layout:
- Stack (direction="vertical" | "horizontal", gap, align, justify)
- Grid (columns, gap)
- Surface (padding, radius, border, elevation)
- Card (interactive, href, onClick)

Typography:
- Text (variant="display1" | "heading1" | "heading2" | "heading3" | "body" | "caption" | "label", color="primary" | "secondary" | "tertiary")

Actions:
- Button (variant="primary" | "secondary" | "tertiary", size="sm" | "md" | "lg")
- IconButton

Feedback:
- Alert (variant="info" | "success" | "warning" | "error", "neutral")

Media:
- HdsImage — responsive image wrapper with HDS aspect ratios

## Token Rules (ALL values must use HDS tokens — no raw hex, no px values, no Tailwind classes)

Colors:
- Background: var(--semantic-color-surface-page), var(--semantic-color-surface-raised), var(--semantic-color-surface-overlay)
- Text: var(--semantic-color-content-primary), var(--semantic-color-content-secondary), var(--semantic-color-content-tertiary)
- Borders: var(--semantic-color-border-default), var(--semantic-color-border-subdued)
- Brand accent: var(--semantic-color-brand-accent)
- Feedback: var(--semantic-color-feedback-error), var(--semantic-color-feedback-success), var(--semantic-color-feedback-warning)

Spacing — use only HDS gap/padding props or these vars:
- var(--semantic-space-subgrid-xs), var(--semantic-space-subgrid-sm), var(--semantic-space-component-gap), var(--semantic-space-layout-section)

Typography — use only Text variant prop, never inline font-size/weight

## Output Format

Output ONLY valid React TSX. No markdown, no explanation, no code fences.
Start directly with the import statements.
The component must be a named export: \`export function MotionClone() { ... }\`

Use descriptive placeholder text that matches the source video's content zones.
Include motion/react animations that faithfully reproduce the observed motion from the keyframes.
If the video shows looping motion, use \`repeat: Infinity\` with \`repeatType: 'reverse'\` or \'loop\' as appropriate.
If the video shows staggered entrances, use \`staggerChildren\`.
If the video shows layout shifts, use \`layout\` prop on motion components.

Example structure:
\`\`\`tsx
import { motion, AnimatePresence } from 'motion/react';
import { Stack, Surface, Text, Button, Grid, Card } from '@hirobius/design-system';

export function MotionClone() {
  return (
    <Stack direction="vertical" gap="layout-section">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: hds.motion.productive.duration, ease: hds.motion.productive.easing }}
      >
        {/* animated zones */}
      </motion.div>
    </Stack>
  );
}
\`\`\`
`;
}

async function analyzeFramesWithClaude(framePaths, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      '\nError: ANTHROPIC_API_KEY environment variable is not set.\n' +
      'Set it before running: export ANTHROPIC_API_KEY=sk-ant-...\n' +
      'See: https://console.anthropic.com/settings/keys\n'
    );
    process.exit(1);
  }

  console.log(`[video-clone] Reading ${framePaths.length} frames for vision analysis...`);

  const imageBlocks = await Promise.all(
    framePaths.map(async (p) => {
      const imageData = await readFile(p);
      const base64Image = imageData.toString('base64');
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64Image,
        },
      };
    })
  );

  console.log(`[video-clone] Sending to claude-sonnet-4-6 (${framePaths.length} frames)...`);

  // Dynamic import — Anthropic SDK is a devDependency
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const content = [
    ...imageBlocks,
    {
      type: 'text',
      text: `These are ${framePaths.length} keyframes extracted from a video, shown in chronological order.
Analyze the motion patterns, transitions, and animation behaviors across these frames.
Output the complete HDS-compliant React TSX component using motion/react primitives that reproduces the observed motion.
Output only valid TSX code — no markdown fences, no explanation.`,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  });

  const jsx = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  // Strip markdown code fences if the model included them despite instructions
  return jsx
    .replace(/^```(?:tsx?|jsx?|typescript)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
}

// ── Step 4: Write output ─────────────────────────────────────────────────────

async function writeOutput(jsxContent, tsxPath) {
  const header = `/** @generated by video-clone.mjs — do not edit manually */\n/* eslint-disable */\n\n`;
  await writeFile(tsxPath, header + jsxContent + '\n', 'utf8');
  console.log(`[video-clone] TSX saved: ${tsxPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  if (!opts.videoPath) {
    console.error('Error: <video-path> argument is required.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  if (!existsSync(opts.videoPath)) {
    console.error(`Error: video file not found: ${opts.videoPath}`);
    process.exit(1);
  }

  // Step 1 — verify ffmpeg
  try {
    await verifyFfmpeg();
    console.log('[video-clone] ffmpeg verified');
  } catch (err) {
    console.error(`[video-clone] ${err.message}`);
    process.exit(1);
  }

  ensureDir(INCOMING_DIR);

  // Step 2 — extract frames
  const { baseName, frames } = await extractFrames(
    opts.videoPath,
    INCOMING_DIR,
    opts.frameStride,
    opts.maxFrames
  );

  if (frames.length === 0) {
    console.error('[video-clone] No frames were extracted. Check ffmpeg output above.');
    process.exit(1);
  }

  console.log(`[video-clone] Extracted ${frames.length} frames`);

  // Step 3 — AI analysis
  const llmsTxt = await loadLlmsTxt();
  const systemPrompt = buildSystemPrompt(llmsTxt);
  const jsx = await analyzeFramesWithClaude(frames, systemPrompt);

  // Step 4 — write JSX
  const tsxPath = opts.output
    ? path.resolve(process.cwd(), opts.output)
    : path.join(INCOMING_DIR, `${baseName}-motion.tsx`);

  await writeOutput(jsx, tsxPath);

  console.log('\n[video-clone] Done.');
  console.log(`  Frames: ${frames.length} extracted`);
  console.log(`  TSX:    ${tsxPath}`);
}

main().catch((err) => {
  console.error('[video-clone] Fatal error:', err.message || err);
  process.exit(1);
});
