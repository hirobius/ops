/**
 * opsApi — the transport seam for the dashboard's calls to the /ops api/* routes.
 *
 * Centralises the POST boilerplate (method + JSON content-type + body
 * serialisation) that was copy-pasted across ~9 call sites. It returns the raw
 * Response: each caller keeps its own response parsing and error handling, because
 * those are genuinely heterogeneous (fire-and-forget, typed-return, bespoke
 * `{code,result,stderr}` / 3-tier envelopes). Unifying *that* would change
 * behaviour per surface, so it's deliberately left at the call site.
 *
 * Same-origin, so the httpOnly ops session cookie rides along automatically — no
 * `credentials` option needed. Typed per-endpoint methods + a unified error shape
 * can be layered on top of this seam later.
 */
export const opsApi = {
  /** POST to an /ops endpoint, JSON-encoding `body` when present. Returns the Response. */
  post(endpoint: string, body?: unknown): Promise<Response> {
    if (body === undefined) return fetch(endpoint, { method: 'POST' });
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};
