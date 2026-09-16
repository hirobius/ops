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
 * Request:  { leadId: string, action: 'generate'|'render', previewUrl?: string }
 *           (previewUrl only used by 'render')
 * Success:  the wrapped pipeline result for that action (shape varies):
 *   generate → { ok, score, pass }
 *   render   → { ok, rendered, slug, preset, configFile, commands }
 * Error:    { error, code? } with status 400/401/404/405/409/422/500/503
 *
 * Env (set by the human — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (generate, lib/agent).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { generateLeadSite, renderLeadSite } from '../lib/leads/pipeline.mjs';
import { addPitchNote, assignPitch, setPitchStage } from '../lib/leads/pitch-actions.mjs';

const ACTIONS = [
  'generate',
  'render',
  // Pitch queue (0012) — folded in here rather than a new function, because
  // the deployment is at the 12-function cap.
  'pitch_stage',
  'pitch_note',
  'pitch_assign',
] as const;
type LeadAction = (typeof ACTIONS)[number];

function isLeadAction(value: unknown): value is LeadAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

export async function leadActionHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as
    | {
        leadId?: unknown;
        action?: unknown;
        previewUrl?: unknown;
        stage?: unknown;
        channel?: unknown;
        note?: unknown;
        author?: unknown;
        assignee?: unknown;
        nextActionAt?: unknown;
      }
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
    case 'render': {
      const previewUrl = typeof body?.previewUrl === 'string' ? body.previewUrl.trim() : '';
      if (previewUrl && !/^https?:\/\//.test(previewUrl)) {
        return { status: 400, body: { error: 'previewUrl must be an http(s) URL' } };
      }
      return renderLeadSite(sb, leadId, previewUrl ? { previewUrl } : {});
    }
    case 'pitch_stage':
      return setPitchStage(sb, leadId, {
        stage: typeof body?.stage === 'string' ? body.stage : '',
        channel: typeof body?.channel === 'string' ? body.channel : '',
      });
    case 'pitch_note':
      return addPitchNote(sb, leadId, {
        author: typeof body?.author === 'string' ? body.author : '',
        body: typeof body?.note === 'string' ? body.note : '',
      });
    case 'pitch_assign':
      return assignPitch(sb, leadId, {
        assignee: typeof body?.assignee === 'string' ? body.assignee : '',
        nextActionAt: body?.nextActionAt as string | null | undefined,
      });
  }
}

export default withOpsHandler('POST', withServiceClient(leadActionHandler));
