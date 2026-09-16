/**
 * lib/chain/liveness.mjs — does a stored `preview_url` still answer?
 *
 * WHY (ops#322). Stage 5 of the chain counts `preview_url IS NOT NULL`. Every
 * other stage counts a state transition that actually happened; this one counts
 * "a URL is stored in a column", which a 404 satisfies exactly as well as a
 * live site. It is the one link whose proof could be a dead link — and the
 * queue a partner works from is built on it.
 *
 * THE RULE THAT MATTERS MOST: a URL we could not check is `unchecked`, never
 * `dead`. `leadFunnel` already holds this distinction for a missing column
 * (null = "cannot measure", not 0 = "measured, none") and it applies with more
 * force here, because the most likely reason a probe fails is our own egress,
 * not the site. #322 was filed from a container that cannot reach vercel.app at
 * all; reporting those two sites as down would have been a lie in the other
 * direction.
 *
 * Caching: one poll must never fan out to N HEAD requests. Verdicts are cached
 * by URL with a long TTL for successes and a short one for failures — a
 * transient network blip must not freeze into an hour of "we don't know".
 * The cache is module-level, so it is per warm lambda: a cold start pays one
 * round of probes. With a handful of published URLs that is proportionate; if
 * the count ever grows, this is the seam to move behind a stored column.
 *
 * @module chain/liveness
 */

export const LIVE = 'live';
export const DEAD = 'dead';
export const UNCHECKED = 'unchecked';

/** Successes are stable; failures are usually ours, so retry them sooner. */
export const OK_TTL_MS = 60 * 60 * 1000; // 1 hour
export const FAIL_TTL_MS = 60 * 1000; // 1 minute

/** Module-level default cache — per warm lambda. Tests pass their own. */
const defaultCache = new Map();

/**
 * Bucket a set of verdicts.
 *
 * @param {Record<string, string>} [verdicts] url -> LIVE | DEAD | UNCHECKED
 * @returns {{ stored: number, live: number, dead: number, unchecked: number }}
 */
export function summarizeLiveness(verdicts) {
  const v = verdicts && typeof verdicts === 'object' ? verdicts : {};
  const out = { stored: 0, live: 0, dead: 0, unchecked: 0 };

  for (const verdict of Object.values(v)) {
    out.stored += 1;
    // Anything that is not an explicit live/dead verdict is unchecked. The
    // buckets must always sum to `stored`, so there is no fourth outcome and
    // no silent drop.
    if (verdict === LIVE) out.live += 1;
    else if (verdict === DEAD) out.dead += 1;
    else out.unchecked += 1;
  }

  return out;
}

/**
 * HEAD each URL, cached. Never throws.
 *
 * @param {string[]} urls
 * @param {object} [opts]
 * @param {Function} [opts.fetchImpl]  injected for tests
 * @param {Map} [opts.cache]
 * @param {number} [opts.ttlMs]        success TTL
 * @param {number} [opts.failTtlMs]
 * @param {() => number} [opts.now]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<Record<string, string>>}
 */
export async function probeUrls(urls, opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    cache = defaultCache,
    ttlMs = OK_TTL_MS,
    failTtlMs = FAIL_TTL_MS,
    now = Date.now,
    timeoutMs = 5000,
  } = opts;

  const list = Array.isArray(urls) ? [...new Set(urls.filter(Boolean))] : [];
  if (!list.length) return {};

  const t = now();
  const out = {};

  await Promise.all(
    list.map(async (url) => {
      const hit = cache.get(url);
      if (hit && hit.expires > t) {
        out[url] = hit.verdict;
        return;
      }

      const verdict = await probeOne(url, fetchImpl, timeoutMs);
      out[url] = verdict;
      // A failed probe expires fast so the next poll retries it; a settled
      // live/dead answer is held for the full TTL.
      const ttl = verdict === UNCHECKED ? failTtlMs : ttlMs;
      cache.set(url, { verdict, expires: t + ttl });
    }),
  );

  return out;
}

/** One HEAD. Any throw means we learned nothing → UNCHECKED, never DEAD. */
async function probeOne(url, fetchImpl, timeoutMs) {
  if (!isHttpUrl(url) || typeof fetchImpl !== 'function') return UNCHECKED;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'manual',
      ...(controller ? { signal: controller.signal } : {}),
    });
    const status = Number(res?.status);
    if (!Number.isFinite(status)) return UNCHECKED;
    // 2xx and 3xx both mean the host answered for this path. A preview that
    // redirects to a custom domain is up, not down.
    return status >= 200 && status < 400 ? LIVE : DEAD;
  } catch {
    return UNCHECKED;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
