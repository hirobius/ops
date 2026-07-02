/**
 * Vercel Serverless Function — GET /api/projects
 *
 * Live fleet status for the /ops Projects surface — and the single endpoint
 * any agent can read for cross-project context (ops-as-hub; see the Live
 * Projects design in the ops thread). One Vercel API call, mapped lean in
 * lib/projects.
 *
 * Success:  { projects: ProjectStatus[] }
 * Error:    { error, code? } with status 401/405/500/503
 *           503 ENV_MISSING_VERCEL_TOKEN until the token is set.
 *
 * Env (set by the human — never in .env by an agent):
 *   VERCEL_TOKEN (required) · VERCEL_TEAM_ID (optional team scope)
 */

import type { VercelRequest } from '@vercel/node';
import { withOpsHandler, type HandlerResult } from '../lib/api/handler';
import { listProjects } from '../lib/projects/index.mjs';

export async function projectsHandler(_req: VercelRequest): Promise<HandlerResult> {
  const result = await listProjects();
  if (!result.ok) {
    const status = result.code === 'ENV_MISSING_VERCEL_TOKEN' ? 503 : 500;
    return { status, body: { error: result.error, code: result.code } };
  }
  return { status: 200, body: { projects: result.projects } };
}

export default withOpsHandler('GET', projectsHandler);
