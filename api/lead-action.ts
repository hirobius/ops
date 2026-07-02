/**
 * Vercel Serverless Function — POST /api/lead-action
 *
 * Single dispatcher for the per-lead lifecycle actions triggered from the /ops
 * Leads board. Consolidates what used to be four separate serverless functions
 * (generate-site / build-site / publish-site / render-site) into one route so
 * the deployment stays under the Hobby-plan 12-function cap. Each action maps
 * 1:1 to a state-machine transition in lib/leads/pipeline; the auth + method +
 * Supabase acquisition wrapper is unchanged (ADR-0004).
 *
 * In dev (`pnpm dev`), the same per-action contracts are served by the Vite
 * middleware in scripts/leads-middleware.mjs (wired in vite.config.mjs).
 *
 * Request:  { leadId: string, action: 'generate'|'build'|'publish'|'render',
 *             previewUrl?: string }   (previewUrl only used by 'render')
 * Success:  the wrapped pipeline result for that action (shape varies):
 *   generate → { ok, score, pass }
 *   build    → { ok, preview_url }
 *   publish  → { ok, live_url }
 *   render   → { ok, rendered, slug, preset, configFile, commands }
 * Error:    { error, code? } with status 400/401/404/405/409/422/500/503
 *
 * Env (set by the human — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (generate,
 *   lib/agent), DUDA_API_USER / DUDA_API_PASSWORD (build/publish, lib/duda).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import {
  generateLeadSite,
  buildLeadSite,
  publishLeadSite,
  renderLeadSite,
} from '../lib/leads/pipeline.mjs';

const ACTIONS = ['generate', 'build', 'publish', 'render'] as const;
type LeadAction = (typeof ACTIONS)[number];

function isLeadAction(value: unknown): value is LeadAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

export async function leadActionHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as
    | { leadId?: unknown; action?: unknown; previewUrl?: unknown }
    | undefined;

  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  const action = body?.action;
  if (!isLeadAction(action)) {
    return {
      status: 400,
      body: { error: `action must be one of: ${ACTIONS.join(', ')}` },
    };
  }

  switch (action) {
    case 'generate':
      return generateLeadSite(sb, leadId);
    case 'build':
      return buildLeadSite(sb, leadId);
    case 'publish':
      return publishLeadSite(sb, leadId);
    case 'render': {
      const previewUrl =
        typeof body?.previewUrl === 'string' ? body.previewUrl.trim() : '';
      if (previewUrl && !/^https?:\/\//.test(previewUrl)) {
        return { status: 400, body: { error: 'previewUrl must be an http(s) URL' } };
      }
      return renderLeadSite(sb, leadId, previewUrl ? { previewUrl } : {});
    }
  }
}

export default withOpsHandler('POST', withServiceClient(leadActionHandler));
