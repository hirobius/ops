/** @internal — not part of @hirobius/design-system public API surface. */
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = Number(process.env.HDS_STREAM_PORT || 3005);
const MANIFEST_PATH = path.join(process.cwd(), 'public/hds-manifest.json');

const clients = new Set();
let sequence = 0;

app.use(cors());

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(command) {
  const payload = {
    sequence: ++sequence,
    receivedAt: new Date().toISOString(),
    command,
  };

  for (const client of clients) {
    sendEvent(client, 'node', payload);
  }

  return payload;
}

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSONL command must be an object.');
  }
  if (parsed.action !== 'ADD_NODE') {
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
        console.warn(`[llm-stream] rejected line: ${err.message}`);
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
        console.warn(`[llm-stream] rejected final line: ${err.message}`);
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
    console.error('[llm-stream] request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });
});

app.get('/get-manifest', (req, res) => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  res.json(manifest);
});

app.post('/update-manifest', express.json({ limit: '50mb' }), (req, res) => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const newTokens = Array.isArray(req.body.tokens) ? req.body.tokens : [];

  for (const newToken of newTokens) {
    const idx = manifest.tokens.primitive.findIndex((token) => token.path === newToken.path);
    if (idx > -1) manifest.tokens.primitive[idx].value = newToken.value;
    else manifest.tokens.primitive.push(newToken);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  res.status(200).json({ status: 'updated', tokens: newTokens.length });
});

const HOST = process.env.HDS_STREAM_HOST || 'localhost';

const server = app.listen(PORT, HOST, () => {
  console.log(`\nHDS LLM stream bridge live at http://${HOST}:${PORT}`);
  console.log(`- POST JSONL to http://localhost:${PORT}/generate`);
  console.log(`- Figma SSE listens at http://localhost:${PORT}/stream`);
});

server.on('error', (err) => {
  console.error(`[llm-stream] failed to listen on ${PORT}: ${err.message}`);
  process.exit(1);
});

setInterval(() => {}, 2147483647);
