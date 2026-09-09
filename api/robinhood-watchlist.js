/**
 * Robinhood Chain watchlist — the aggregate feed behind the RH tab.
 *
 * Fans out to DexScreener (market data), DefiLlama (chain + protocol fundamentals)
 * and the chain's public RPC (supply / burns / treasury), merges in Apify-sourced
 * X follower counts and the snapshot history, and returns one payload the client
 * polls every 2 minutes.
 *
 * Cache: 120s in-memory (warm lambda) -> Redis mirror (cross-instance + stale-on-error).
 */

import { buildPayload, mergeWithPrevious } from './_lib/rh-aggregate.js';
import { KEYS, readJSON, writeJSON } from './_lib/rh-store.js';

export const config = { runtime: 'edge' };

const CACHE_TTL_MS = 120 * 1000;
// `?refresh=1` is a public path, so it gets a floor of its own: without one, a
// reload loop forces a full DexScreener fan-out per request and rate-limits us.
const FORCE_MIN_INTERVAL_MS = 30 * 1000;
let memCache = { data: null, ts: 0 };
// Concurrent callers share one build instead of each starting its own fan-out.
let inFlight = null;

function json(body, { cache = 'HIT', status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      'X-Cache': cache,
    },
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';

  const age = Date.now() - memCache.ts;
  const ttl = force ? FORCE_MIN_INTERVAL_MS : CACHE_TTL_MS;
  if (memCache.data && age < ttl) {
    return json(memCache.data, { cache: force ? 'HIT-THROTTLED' : 'HIT' });
  }

  try {
    inFlight ||= (async () => {
      const fresh = await buildPayload();

      // A run where every price is null means the upstreams failed, not that the
      // chain went quiet — serve the last good payload instead of blanking the tab.
      const previous = memCache.data || (await readJSON(KEYS.payload));
      if (fresh.coverage.priced === 0 && previous) {
        return { ...previous, stale: true };
      }

      // Partial failures are the common case: patch the holes from the last
      // good payload rather than rendering half-empty panels.
      const payload = mergeWithPrevious(fresh, previous);
      memCache = { data: payload, ts: Date.now() };
      writeJSON(KEYS.payload, payload, 3600).catch(() => {});
      return payload;
    })().finally(() => { inFlight = null; });

    const payload = await inFlight;
    return json(payload, { cache: payload.stale ? 'STALE' : 'MISS' });
  } catch (e) {
    console.error('[RH] watchlist build failed:', e);
    const stale = memCache.data || (await readJSON(KEYS.payload));
    if (stale) return json({ ...stale, stale: true }, { cache: 'ERROR-FALLBACK' });
    return json({ error: 'Failed to build Robinhood watchlist' }, { cache: 'ERROR', status: 500 });
  }
}
