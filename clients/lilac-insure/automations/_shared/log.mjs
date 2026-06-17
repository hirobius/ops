import fs from 'node:fs';
import path from 'node:path';
import { clientRoot } from './config-loader.mjs';

export function logEvent(rootConfig, event) {
  const logFile = path.resolve(clientRoot(), '..', '..', rootConfig.logPath);
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    mode: rootConfig.mode,
    ...event,
  });
  fs.appendFileSync(logFile, line + '\n');
}
