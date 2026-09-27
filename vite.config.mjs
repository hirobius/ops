import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSkillRunnerMiddleware } from './scripts/skill-runner-middleware.mjs';
import { createServiceManagerMiddleware } from './scripts/service-manager-middleware.mjs';
import { createLeadsMiddleware } from './scripts/leads-middleware.mjs';
import { createTasksMiddleware } from './scripts/tasks-middleware.mjs';
import { createDigestMiddleware } from './scripts/digest-middleware.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Surface server-only secrets to the dev middleware (scripts/leads-middleware.mjs).
  // loadEnv reads them from .env.local but does not inject them into process.env.
  // Dev-only; production functions read Vercel env directly. Values are never logged.
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_PLACES_API_KEY',
    'ANTHROPIC_API_KEY',
    'GITHUB_TOKEN',
    'GITHUB_REPO',
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    define: {
      __FIGMA_FILE_ID__: JSON.stringify(env.FIGMA_FILE_ID ?? ''),
    },
    plugins: [
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
      // Dev-only: leads pipeline — POST /api/pull-leads, POST /api/lead-action,
      // GET /api/leads. Mirrors the production Vercel functions in api/* using the
      // same lib/* logic (single source of truth). See scripts/leads-middleware.mjs.
      // apply: 'serve' so prod builds never expose these — Vercel serves the
      // api/* functions in production.
      {
        name: 'ops-leads-api',
        apply: 'serve',
        configureServer(server) {
          const leads = createLeadsMiddleware();
          server.middlewares.use('/api/pull-leads', leads.pull);
          server.middlewares.use('/api/lead-action', leads.action);
          server.middlewares.use('/api/leads', leads.list);
        },
      },
      // Dev-only: consolidated tasks board — GET /api/tasks, POST /api/task-action.
      // Mirrors the prod Vercel functions via the same lib/tasks logic.
      {
        name: 'ops-tasks-api',
        apply: 'serve',
        configureServer(server) {
          const tasks = createTasksMiddleware();
          server.middlewares.use('/api/task-action', tasks.action);
          server.middlewares.use('/api/tasks', tasks.list);
        },
      },
      // Dev-only: digest board — GET /api/digest, POST /api/digest-action.
      // Mirrors the prod Vercel functions via the same lib/digests logic.
      {
        name: 'ops-digest-api',
        apply: 'serve',
        configureServer(server) {
          const digest = createDigestMiddleware();
          server.middlewares.use('/api/digest-action', digest.action);
          server.middlewares.use('/api/digest', digest.list);
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
            // Lucide icons — many routes import individual icons; isolating avoids
            // repeated tree-shake work and makes the chunk cacheable.
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
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
