import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSkillRunnerMiddleware } from './scripts/skill-runner-middleware.mjs';
import { createThreadsMiddleware } from './scripts/threads-middleware.mjs';
import { createProposedUnitsMiddleware } from './scripts/proposed-units-middleware.mjs';
import { createProposedSkillsMiddleware } from './scripts/proposed-skills-middleware.mjs';
import { createServiceManagerMiddleware } from './scripts/service-manager-middleware.mjs';
import { createCcPluginsMiddleware } from './scripts/cc-plugins-middleware.mjs';
import { createResearchFeedMiddleware } from './scripts/research-feed-middleware.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hdsManifestModuleId = 'virtual:hds-manifest';
const resolvedHdsManifestModuleId = `\0${hdsManifestModuleId}`;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      __FIGMA_FILE_ID__: JSON.stringify(env.FIGMA_FILE_ID ?? ''),
    },
    plugins: [
      {
        name: 'hds-manifest-virtual-module',
        resolveId(id) {
          return id === hdsManifestModuleId ? resolvedHdsManifestModuleId : null;
        },
        load(id) {
          if (id !== resolvedHdsManifestModuleId) return null;
          const manifest = readFileSync(
            path.resolve(__dirname, 'public/hds-manifest.json'),
            'utf8',
          );
          return `export default ${manifest};`;
        },
      },
      react(),
      tailwindcss(),
      // Dev-only: POST /api/route — accepts { text, client } body, spawns
      // scripts/auto-assigner.mjs, returns its JSON. Lets /ops/sessions
      // submit messages from the browser (incl. mobile on the LAN) without
      // a separate bridge process. For prod deploy, replace with a real
      // serverless route or expose via scripts/hds-bridge.mjs.
      {
        name: 'ops-route-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/api/route', async (req, res, next) => {
            if (req.method !== 'POST') return next();
            try {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const raw = Buffer.concat(chunks).toString();
              const { text, client } = JSON.parse(raw || '{}');
              if (!text || !client) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'text and client are required' }));
                return;
              }
              const proc = spawn('node', ['scripts/auto-assigner.mjs', '--client', client], {
                cwd: __dirname,
                stdio: ['pipe', 'pipe', 'pipe'],
              });
              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (c) => {
                stdout += c.toString();
              });
              proc.stderr.on('data', (c) => {
                stderr += c.toString();
              });
              proc.on('close', (code) => {
                let result = null;
                try {
                  result = JSON.parse(stdout);
                } catch {
                  /* result stays null */
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ code, result, stderr: stderr.slice(0, 500) }));
              });
              proc.on('error', (error) => {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error.message }));
              });
              proc.stdin.write(text);
              proc.stdin.end();
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(error?.message || error) }));
            }
          });
        },
      },
      // Dev-only: POST /api/skills/:id — whitelisted skill runner that backs the
      // /ops dashboard's skills bar. See scripts/skill-runner-middleware.mjs for
      // the whitelist; anything outside it returns 403. apply: 'serve' so prod
      // builds never expose this endpoint.
      {
        name: 'ops-skills-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/api/skills', createSkillRunnerMiddleware({ cwd: __dirname }));
        },
      },
      // Dev-only: GET /api/cc-plugins — lists all Claude Code skills visible to
      // the dev session (project-local + global). Backs the /ops CC Plugins
      // panel. apply: 'serve' so prod builds never expose this endpoint.
      {
        name: 'ops-cc-plugins-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/api/cc-plugins', createCcPluginsMiddleware({ cwd: __dirname }));
        },
      },
      // Dev-only: GET /api/research-feed — surfaces auto-research findings
      // from docs/research/findings/<id>/*.md. Read-only filesystem scan;
      // backs the /ops "Research" disclosure. apply: 'serve' so prod never
      // exposes disk reads. See scripts/research-feed-middleware.mjs.
      {
        name: 'ops-research-feed-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/api/research-feed',
            createResearchFeedMiddleware({ projectRoot: __dirname }),
          );
        },
      },
      // Dev-only: GET /api/threads — surfaces git worktrees, live Claude
      // Code sessions (~/.claude/sessions/*.json), and recent transcripts
      // (~/.claude/projects/<slug>/*.jsonl mtimes) so /ops/kanban can
      // correlate "open work" with Hermes tasks. Read-only filesystem
      // scan, no Hermes call. apply: 'serve' so prod never exposes it.
      {
        name: 'ops-threads-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/api/threads',
            createThreadsMiddleware({
              projectRoot: __dirname,
              // Surface the sibling concrete-creations repo as a
              // thread source — its branches don't match Hermes task
              // IDs, so they land in the loose-threads rail.
              siblingRoots: [path.resolve(__dirname, '..', 'concrete-creations')],
            }),
          );
        },
      },
      // Dev-only: GET /api/proposed-units — streams docs/ai/proposed-units.jsonl
      // (the agent-proposed pre-Hermes idea backlog) for /ops/kanban's
      // backlog disclosure. apply: 'serve' so prod never reads from disk.
      {
        name: 'ops-proposed-units-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/api/proposed-units',
            createProposedUnitsMiddleware({ projectRoot: __dirname }),
          );
        },
      },
      // Dev-only: GET/POST /api/proposed-skills — capture seam for natural-
      // language skill descriptions. POST appends one JSONL line to
      // docs/ai/proposed-skills.jsonl (gitignored, append-only). The build
      // step happens later in an interactive Claude Code session — this
      // endpoint captures intent only and never triggers code generation.
      // apply: 'serve' so prod never exposes the disk write.
      {
        name: 'ops-proposed-skills-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/api/proposed-skills',
            createProposedSkillsMiddleware({ projectRoot: __dirname }),
          );
        },
      },
      // Dev-only: /api/services/* — start/stop/status local dev daemons
      // (HDS Bridge, Discord Bot, Roadmap Watcher). Process state is in-memory;
      // resets when Vite restarts. See scripts/service-manager-middleware.mjs.
      {
        name: 'ops-services-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/api/services',
            createServiceManagerMiddleware({ cwd: __dirname }),
          );
        },
      },
      // Dev-only: GET /api/pod-tail?id=<unitId> — returns last 50 telemetry
      // events whose `data.unitId` matches the queried pod id. Backs the
      // 13w-ops-13a polled stdout tail on /ops/sessions. apply: 'serve' so
      // prod builds never expose this endpoint.
      {
        name: 'ops-pod-tail-api',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/api/pod-tail', async (req, res, next) => {
            if (req.method !== 'GET') return next();
            try {
              const url = new URL(req.url, 'http://localhost');
              const id = url.searchParams.get('id');
              if (!id) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'id query param required' }));
                return;
              }
              const fs = await import('node:fs');
              const path = await import('node:path');
              const eventsPath = path.join(__dirname, 'telemetry/events.jsonl');
              if (!fs.existsSync(eventsPath)) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ id, events: [] }));
                return;
              }
              const raw = fs.readFileSync(eventsPath, 'utf8');
              const lines = raw.split('\n').filter(Boolean);
              const matched = [];
              // Walk lines bottom-up so we cap at 50 most-recent matches without
              // parsing the whole file when the tail is very long.
              for (let i = lines.length - 1; i >= 0 && matched.length < 50; i--) {
                try {
                  const evt = JSON.parse(lines[i]);
                  const candidate = evt?.data?.unitId ?? evt?.data?.unit_id ?? evt?.data?.id;
                  if (candidate === id) matched.unshift(evt);
                } catch {
                  /* skip malformed line */
                }
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ id, events: matched }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(error?.message || error) }));
            }
          });
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 3000,
      // Proxies /api/hermes/* → the locally-running Hermes Agent dashboard
      // plugin API (`hermes dashboard --no-open`, port 9119). Plugin routes
      // bypass the dashboard's auth middleware on localhost, so same-origin
      // fetch from /ops/kanban needs no token. The page degrades to an
      // "offline" banner when 9119 is unreachable.
      proxy: {
        '/api/hermes': {
          target: 'http://127.0.0.1:9119',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/hermes/, '/api/plugins/kanban'),
          // Hermes dashboard regenerates an in-memory session token per
          // restart; surfacing a connection error fast lets the UI flip
          // to the offline state instead of hanging the request.
          timeout: 4000,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      // Force all packages to use the project's React 18.
      dedupe: ['react', 'react-dom'],
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    build: {
      // 750kB uncompressed ≈ 250kB gzip. The vendor-three chunk is expected to
      // exceed this (three.js is ~984kB) — it loads lazily via the 3D canvas route.
      // All app/vendor-react chunks must stay under this limit.
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) {
              return 'vendor-motion';
            }
            if (
              id.includes('node_modules/recharts/') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-')
            ) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/@radix-ui/')) {
              return 'vendor-radix';
            }
            // three.js stack — pulled eagerly by HdsMobiusLogo via @react-three/fiber.
            // Kept in a dedicated chunk so it doesn't block the main entry parse.
            if (
              id.includes('node_modules/three/') ||
              id.includes('node_modules/@react-three/') ||
              id.includes('node_modules/postprocessing/') ||
              id.includes('node_modules/troika-') ||
              id.includes('node_modules/meshline/')
            ) {
              return 'vendor-three';
            }
            // Lucide icons — many routes import individual icons; isolating avoids
            // repeated tree-shake work and makes the chunk cacheable.
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            // Virtual hds-manifest — inline JSON export; split so the main entry
            // stays under budget and the manifest chunk is independently cacheable.
            // resolvedHdsManifestModuleId starts with \0 so we match the raw string.
            if (id === resolvedHdsManifestModuleId || id.includes('virtual:hds-manifest')) {
              return '_virtual_hds-manifest';
            }
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
