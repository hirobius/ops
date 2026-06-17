/**
 * scripts/cc-plugins-middleware.mjs
 *
 * Dev-only middleware: GET /api/cc-plugins
 * Enumerates installed Claude Code skills from:
 *   - ~/.claude/skills/          (global user skills)
 *   - {cwd}/.claude/skills/      (project-scoped skills)
 * Reads SKILL.md frontmatter from each skill directory.
 * Project skills take precedence over global on name collision.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve }             from 'node:path';
import { homedir }                   from 'node:os';

/**
 * Parse the YAML-ish frontmatter block from a SKILL.md file.
 * Returns { name, description } — other keys ignored.
 * Handles single- and double-quoted values.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = line.slice(0, colonIdx).trim();
    let   value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Read all skill entries from a skills directory.
 * Silently skips dirs with no SKILL.md.
 *
 * @param {string} dir
 * @param {'global'|'project'} source
 * @returns {Array<{name:string,description:string,invocation:string,source:string}>}
 */
function readSkillsDir(dir, source) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const skills  = [];
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        const content = readFileSync(join(dir, entry.name, 'SKILL.md'), 'utf8');
        const fm      = parseFrontmatter(content);
        const name    = fm.name ?? entry.name;
        skills.push({
          name,
          description: fm.description ?? '',
          invocation:  `claude /${name}`,
          source,
        });
      } catch {
        // No SKILL.md — skip
      }
    }
    return skills;
  } catch {
    return [];
  }
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * @param {{ cwd: string }} opts
 */
export function createCcPluginsMiddleware({ cwd }) {
  const globalDir  = join(homedir(), '.claude', 'skills');
  const projectDir = join(resolve(cwd), '.claude', 'skills');

  return function ccPlugins(req, res, next) {
    if (req.method !== 'GET') return next();

    const projectSkills = readSkillsDir(projectDir, 'project');
    const globalSkills  = readSkillsDir(globalDir,  'global');

    // Project skills take precedence; dedup by name
    const seen   = new Set();
    const skills = [];
    for (const skill of [...projectSkills, ...globalSkills]) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push(skill);
      }
    }

    jsonResponse(res, 200, { skills });
  };
}
