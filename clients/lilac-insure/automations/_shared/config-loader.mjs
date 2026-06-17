import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(HERE, '..', '..');
const ROOT_CONFIG_PATH = path.join(CLIENT_DIR, 'automation-config.json');

export function loadRootConfig() {
  if (!fs.existsSync(ROOT_CONFIG_PATH)) {
    throw new Error(`automation-config.json not found at ${ROOT_CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(ROOT_CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  if (cfg.mode !== 'test' && cfg.mode !== 'production') {
    throw new Error(`Invalid mode in automation-config.json: ${cfg.mode}`);
  }
  return cfg;
}

export function loadWorkflowConfig(workflowDir) {
  const p = path.join(workflowDir, 'config.json');
  if (!fs.existsSync(p)) throw new Error(`workflow config.json not found at ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function checkEnvKeys(systemKey, rootConfig) {
  const sys = rootConfig.systems?.[systemKey];
  if (!sys) return { system: systemKey, present: [], missing: [], status: 'unknown-system' };
  const present = [];
  const missing = [];
  for (const key of sys.envKeys ?? []) {
    if (process.env[key]) present.push(key); else missing.push(key);
  }
  return { system: systemKey, present, missing, status: sys.status };
}

export function clientRoot() {
  return CLIENT_DIR;
}
