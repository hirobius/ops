/**
 * Vercel Serverless Function — POST /api/route
 *
 * Production path for the AI task-routing endpoint.
 * In development, /api/route is served by the Vite middleware in vite.config.mjs (lines 34-85).
 * This file handles the same contract in Vercel's Node.js runtime.
 *
 * ── Architecture (Plan §E, Option A) ────────────────────────────────────────
 * This function is a PROXY — it forwards requests to a Hetzner-hosted assigner
 * process (scripts/auto-assigner.mjs). It does NOT spawn child_process; Vercel's
 * filesystem is read-only and the assigner mutates clients in clients/[slug]/tasks.json.
 * See docs/operations/vps-deployment.md for Hetzner setup.
 *
 * The OUTLIER among the guarded routes: it needs auth + method but NO Supabase
 * client, so it uses withOpsHandler directly (skips withServiceClient). It keeps
 * its own env (503) and upstream (502) handling and returns { status, body }.
 *
 * ── Environment Variables (set by human in Vercel dashboard — never in .env) ─
 *   HIROBIUS_BRIDGE_URL   Full URL of the Hetzner assigner endpoint,
 *                         e.g. https://ops.hirobius.com/api/assign
 *                         If unset, the function returns 503 with setup instructions.
 *
 *   HDS_BRIDGE_SECRET     Shared HMAC-SHA256 secret for request signing.
 *                         The Hetzner side verifies this header before processing.
 *                         If unset, the function returns 503 with setup instructions.
 *
 * ── Request / Response (matches dev middleware shape) ───────────────────────
 *   POST body:  { text: string, client: string }
 *   Success:    { code: number, result: unknown, stderr: string }
 *   Error:      { error: string } with status 400/401/503/502
 *
 * ── HMAC signing ────────────────────────────────────────────────────────────
 *   Authorization: HMAC <hex>
 *   hex = HMAC-SHA256(HDS_BRIDGE_SECRET, JSON.stringify(body)).digest('hex')
 */

import { createHmac } from 'crypto';
import type { VercelRequest } from '@vercel/node';
import { withOpsHandler, messageOf, type HandlerResult } from '../lib/api/handler.js';

/** Maximum body size accepted (bytes). */
const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export async function routeHandler(req: VercelRequest): Promise<HandlerResult> {
  // ── Env guard ─────────────────────────────────────────────────────────────
  const bridgeUrl = process.env['HIROBIUS_BRIDGE_URL'];
  const bridgeSecret = process.env['HDS_BRIDGE_SECRET'];

  if (!bridgeUrl) {
    return {
      status: 503,
      body: {
        error:
          'HIROBIUS_BRIDGE_URL is not set. Add it in the Vercel project environment variables. See docs/operations/vps-deployment.md for Hetzner setup.',
        code: 'ENV_MISSING_BRIDGE_URL',
      },
    };
  }
  if (!bridgeSecret) {
    return {
      status: 503,
      body: {
        error:
          'HDS_BRIDGE_SECRET is not set. Add the shared HMAC secret in the Vercel project environment variables. It must match the secret on the Hetzner assigner.',
        code: 'ENV_MISSING_BRIDGE_SECRET',
      },
    };
  }

  // ── Body parsing ─────────────────────────────────────────────────────────
  const body = req.body as { text?: unknown; client?: unknown } | undefined;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const client = typeof body?.client === 'string' ? body.client.trim() : '';

  if (!text || !client) return { status: 400, body: { error: 'text and client are required' } };
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return { status: 400, body: { error: 'text exceeds maximum allowed size (64 KB)' } };
  }

  // ── HMAC signing ─────────────────────────────────────────────────────────
  const payloadJson = JSON.stringify({ text, client });
  const hmacHex = createHmac('sha256', bridgeSecret).update(payloadJson).digest('hex');

  // ── Proxy to Hetzner ─────────────────────────────────────────────────────
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `HMAC ${hmacHex}`,
      },
      body: payloadJson,
      // Vercel hobby timeout is 10s. Assigner returns in <2s, fits.
      signal: AbortSignal.timeout(9000),
    });
  } catch (err) {
    return {
      status: 502,
      body: { error: `Upstream assigner unreachable: ${messageOf(err)}`, code: 'UPSTREAM_UNREACHABLE', stderr: '' },
    };
  }

  // ── Forward upstream response ────────────────────────────────────────────
  if (upstreamRes.ok) {
    // Happy path: relay the assigner's JSON unchanged so SessionInputForm
    // sees the same { code, result, stderr } shape as the dev middleware.
    let upstreamBody: unknown;
    try {
      upstreamBody = await upstreamRes.json();
    } catch {
      upstreamBody = { code: 0, result: null, stderr: '' };
    }
    return { status: 200, body: upstreamBody };
  }

  // Upstream error: return a compatible error envelope.
  let errText = '';
  try {
    errText = await upstreamRes.text();
  } catch {
    /* ignore */
  }
  return {
    status: 502,
    body: { error: `Assigner returned HTTP ${upstreamRes.status}`, code: upstreamRes.status, stderr: errText.slice(0, 500) },
  };
}

export default withOpsHandler('POST', routeHandler);
