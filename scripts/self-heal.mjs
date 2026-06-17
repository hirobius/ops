#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */

import { exec, spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 5201;
const BASE_URL = process.env.HEAL_SMOKE_URL || `http://127.0.0.1:${PORT}`;
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const STATIC_CHECKS = [
  { name: 'Typecheck', command: 'pnpm typecheck' },
  { name: 'TokenAndLayoutAudit', command: 'pnpm check:ghost-tokens' },
  { name: 'ContrastAudit', command: 'pnpm check:contrast' },
  { name: 'AriaLabelAudit', command: 'pnpm check:aria' },
  { name: 'AccessibilityPages', command: 'pnpm test:a11y' },
  { name: 'LayoutIntegrity', command: 'pnpm test:layout' },
];

const DEFAULT_SMOKE_PATHS = [
  '/hds/typography',
  '/hds/color',
  '/hds/spacing',
  '/hds/shape',
  '/hds/components',
  '/lab/incubator',
];

const BOILERPLATE_PATTERNS = [
  /^>\s/,
  /^ELIFECYCLE\b/,
  /^ERR_PNPM_/,
  /^Command failed with exit code\b/,
  /^undefined$/,
];

function cleanOutput(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseArgs(argv) {
  const options = {
    smoke: false,
    path: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--smoke') {
      options.smoke = true;
      continue;
    }

    if (arg === '--path') {
      const value = argv[index + 1];
      if (value) {
        options.path.push(value);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--path=')) {
      options.path.push(arg.slice('--path='.length));
    }
  }

  return options;
}

function resolveSmokePaths(cliPaths) {
  const envPaths = process.env.HEAL_TARGET_PATHS
    ? process.env.HEAL_TARGET_PATHS.split(',').map((value) => value.trim()).filter(Boolean)
    : process.env.HEAL_TARGET_PATH
      ? [process.env.HEAL_TARGET_PATH.trim()].filter(Boolean)
      : [];

  const paths = [...cliPaths, ...envPaths];
  return (paths.length > 0 ? paths : DEFAULT_SMOKE_PATHS)
    .map((path) => path.startsWith('/') ? path : `/${path}`)
    .filter((path, index, collection) => collection.indexOf(path) === index);
}

async function runCheck(check) {
  return new Promise((resolve) => {
    exec(
      check.command,
      {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
        },
      },
      (error, stdout, stderr) => {
        resolve({
          ...check,
          ok: !error,
          stdout: cleanOutput(stdout ?? ''),
          stderr: cleanOutput(stderr ?? ''),
        });
      },
    );
  });
}

function startSmokeServer() {
  return spawn(
    PNPM,
    ['exec', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
    },
  );
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {}

    await wait(500);
  }

  throw new Error(`Smoke server did not start in time at ${BASE_URL}`);
}

async function serializeConsoleArg(handle) {
  try {
    return await handle.evaluate((value) => {
      if (value instanceof Error) {
        return value.stack ?? `${value.name}: ${value.message}`;
      }

      if (value && typeof value === 'object') {
        if ('stack' in value && typeof value.stack === 'string' && value.stack.trim()) {
          return value.stack;
        }

        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      }

      return typeof value === 'string' ? value : String(value);
    });
  } catch {
    return null;
  }
}

async function formatConsoleError(message, path) {
  const serializedArgs = (await Promise.all(message.args().map(serializeConsoleArg))).filter(Boolean);
  const location = message.location();
  const locationText = location.url
    ? `${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0}`
    : 'unknown location';
  const body = cleanOutput(serializedArgs.join('\n\n') || message.text());

  return [
    `Console error on ${path}`,
    `Location: ${locationText}`,
    '',
    body || 'Console error with no message payload.',
  ].join('\n');
}

async function detectWhiteScreen(page) {
  return page.evaluate(() => {
    const body = document.body;
    const root = document.querySelector('#root');

    if (!body) {
      return {
        empty: true,
        reason: 'document.body missing',
        bodyText: '',
        rootText: '',
        bodyChildren: 0,
        rootChildren: 0,
      };
    }

    const bodyText = body.innerText.trim();
    const rootText = root instanceof HTMLElement ? root.innerText.trim() : '';
    const rootChildren = root instanceof HTMLElement ? root.children.length : 0;
    const visibleContent = Array.from((root ?? body).querySelectorAll('*')).some((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
        && element.innerText.trim().length > 0;
    });
    const mediaContent = Boolean((root ?? body).querySelector('img,svg,canvas,video'));
    const empty = bodyText.length === 0 && rootText.length === 0 && !visibleContent && !mediaContent;

    return {
      empty,
      reason: empty ? 'body and root rendered without visible content' : '',
      bodyText,
      rootText,
      bodyChildren: body.children.length,
      rootChildren,
    };
  });
}

async function smokeTest(paths) {
  const shouldStartServer = !process.env.HEAL_SMOKE_URL;
  const server = shouldStartServer ? startSmokeServer() : null;
  let serverStdout = '';
  let serverStderr = '';

  server?.stdout.on('data', (chunk) => {
    serverStdout += chunk.toString();
  });

  server?.stderr.on('data', (chunk) => {
    serverStderr += chunk.toString();
  });

  try {
    await waitForServer();

    const browser = await chromium.launch({ headless: true });
    const failures = [];

    for (const path of paths) {
      const page = await browser.newPage();
      const pageErrors = [];
      const consoleTasks = [];

      page.on('pageerror', (error) => {
        pageErrors.push([
          `Page error on ${path}`,
          '',
          cleanOutput(error?.stack ?? error?.message ?? String(error)),
        ].join('\n'));
      });

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleTasks.push(formatConsoleError(message, path));
        }
      });

      try {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('body');
        await page.waitForTimeout(750);
      } catch (error) {
        failures.push({
          path,
          details: cleanOutput(error?.stack ?? error?.message ?? String(error)),
        });
      }

      const consoleErrors = (await Promise.all(consoleTasks)).filter(Boolean);
      const whiteScreen = await detectWhiteScreen(page);

      if (pageErrors.length > 0 || consoleErrors.length > 0 || whiteScreen.empty) {
        const details = [
          ...pageErrors,
          ...consoleErrors,
          ...(whiteScreen.empty ? [
            [
              `White Screen detected on ${path}`,
              '',
              `Reason: ${whiteScreen.reason}`,
              `Body children: ${whiteScreen.bodyChildren}`,
              `Root children: ${whiteScreen.rootChildren}`,
              `Body text: ${whiteScreen.bodyText || '(empty)'}`,
              `Root text: ${whiteScreen.rootText || '(empty)'}`,
            ].join('\n'),
          ] : []),
        ].join('\n\n');

        failures.push({ path, details });
      }

      await page.close();
    }

    await browser.close();

    return {
      name: 'RuntimeSmoke',
      command: `smokeTest(${paths.join(', ')})`,
      ok: failures.length === 0,
      stdout: '',
      stderr: cleanOutput([
        failures.map((failure) => `### ${failure.path}\n\n${failure.details}`).join('\n\n'),
        cleanOutput(serverStderr),
      ].filter(Boolean).join('\n\n')),
      serverStdout: cleanOutput(serverStdout),
    };
  } finally {
    server?.kill();
  }
}

function formatFailureSection(result) {
  const details = result.details
    ?? ([result.stdout, result.stderr].filter(Boolean).join('\n\n').trim() || 'No diagnostic output captured.');

  return [
    `#### ${result.name}`,
    '',
    `Command: \`${result.command}\``,
    '',
    '```text',
    details,
    '```',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const paths = resolveSmokePaths(options.path);
  const results = options.smoke
    ? [await smokeTest(paths)]
    : await STATIC_CHECKS.reduce(async (promise, check) => {
      const collected = await promise;
      const result = await runCheck(check);
      return [...collected, result];
    }, Promise.resolve([]));
  const failures = results.filter((result) => !result.ok);

  if (failures.length === 0) {
    if (options.smoke) {
      console.log(`Self-heal smoke passed: runtime render checks are green for ${paths.join(', ')}.`);
      return;
    }

    console.log('Self-heal checks passed: typecheck, token/layout audit, accessibility gates, and layout integrity are green.');
    return;
  }

  console.log('### AI DIAGNOSTIC REPORT\n');
  console.log(`Status: FAIL (${failures.length}/${results.length} checks failed)`);
  console.log(`Working Directory: \`${process.cwd()}\``);
  if (options.smoke) {
    console.log(`Smoke Paths: \`${paths.join(', ')}\``);
  }
  console.log('');

  failures.forEach((failure, index) => {
    if (index > 0) console.log('');
    console.log(formatFailureSection(failure));
  });

  process.exit(1);
}

main().catch((error) => {
  console.error('### AI DIAGNOSTIC REPORT\n');
  console.error('Status: EXECUTION ERROR\n');
  console.error('```text');
  console.error(cleanOutput(error?.stack ?? error?.message ?? String(error)));
  console.error('```');
  process.exit(1);
});
