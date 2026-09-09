// Redis-backed store for the Robinhood tab.
// Two things live here that no upstream API can give us:
//   1. HISTORY — the APIs report levels, not growth. Snapshots make deltas possible.
//   2. SOCIAL  — X follower counts scraped through Apify on a slow cron.
// Everything degrades to null when Upstash env vars are absent, so the tab still
// renders (just without deltas and sparklines) on a bare local checkout.

import { Redis } from '@upstash/redis';

let redis = null;
let redisInitFailed = false;

export function getRedis() {
  if (redis) return redis;
  if (redisInitFailed) return null;

  // Vercel's Redis integration provisions KV_REST_API_* rather than
  // UPSTASH_REDIS_REST_*; both speak the same REST protocol.
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '')
    .trim().replace(/\/+$/, '');
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token) {
    redisInitFailed = true;
    return null;
  }
  try {
    redis = new Redis({ url, token });
  } catch (err) {
    console.warn('[RH] Redis init failed:', err.message);
    redisInitFailed = true;
    return null;
  }
  return redis;
}

export const KEYS = {
  payload: 'rh:payload:v1',        // last good aggregate response (stale-on-error fallback)
  history: 'rh:history:v1',        // rolling snapshot series
  social: 'rh:social:v1',          // { handle: { followers, tweets, name, ts } }
  socialPrev: 'rh:social:prev:v1', // previous poll, for follower deltas
};

const HISTORY_MAX = 720; // ~30 days at hourly snapshots

export async function readJSON(key, fallback = null) {
  const r = getRedis();
  if (!r) return fallback;
  try {
    const val = await r.get(key);
    return val ?? fallback;
  } catch (e) {
    console.warn(`[RH] Redis read ${key} failed:`, e.message);
    return fallback;
  }
}

export async function writeJSON(key, value, ttlSeconds) {
  const r = getRedis();
  if (!r) return false;
  try {
    if (ttlSeconds) await r.set(key, value, { ex: ttlSeconds });
    else await r.set(key, value);
    return true;
  } catch (e) {
    console.warn(`[RH] Redis write ${key} failed:`, e.message);
    return false;
  }
}

/** Append one snapshot and trim the series. Snapshots are deliberately small. */
export async function appendSnapshot(snapshot) {
  const r = getRedis();
  // Distinguish "no credentials" from "credentials rejected": both used to
  // report as unconfigured, which sent debugging in the wrong direction.
  if (!r) return { ok: false, reason: 'not-configured' };
  try {
    const series = (await r.get(KEYS.history)) || [];
    series.push(snapshot);
    const trimmed = series.slice(-HISTORY_MAX);
    await r.set(KEYS.history, trimmed);
    return { ok: true, length: trimmed.length };
  } catch (e) {
    console.warn('[RH] snapshot append failed:', e.message);
    return { ok: false, reason: 'redis-error', message: String(e.message || e).slice(0, 300) };
  }
}

export async function readHistory() {
  return (await readJSON(KEYS.history, [])) || [];
}

/**
 * Turn the raw series into per-token sparklines and deltas.
 * Returns { [symbol]: { spark: number[], change7d, mcapChange7d, liqChange24h, ... } }
 */
export function deriveHistory(series, symbols) {
  const out = {};
  if (!Array.isArray(series) || series.length === 0) return out;

  const now = Date.now();
  const at = (maxAgeMs) => {
    // newest snapshot that is at least maxAgeMs old
    for (let i = series.length - 1; i >= 0; i--) {
      if (now - series[i].ts >= maxAgeMs) return series[i];
    }
    return null;
  };
  const day = 86400000;
  const ref24h = at(day);
  const ref7d = at(7 * day);

  const pct = (curr, prev) =>
    curr != null && prev != null && prev !== 0 ? ((curr - prev) / prev) * 100 : null;

  for (const symbol of symbols) {
    const spark = series
      .slice(-48)
      .map(s => s.tokens?.[symbol]?.p)
      .filter(v => typeof v === 'number');

    const latest = series[series.length - 1]?.tokens?.[symbol];
    const prev24 = ref24h?.tokens?.[symbol];
    const prev7 = ref7d?.tokens?.[symbol];

    out[symbol] = {
      spark,
      mcapChange7d: pct(latest?.m, prev7?.m),
      liqChange24h: pct(latest?.l, prev24?.l),
      liqChange7d: pct(latest?.l, prev7?.l),
      volChange24h: pct(latest?.v, prev24?.v),
      followersChange7d:
        latest?.f != null && prev7?.f != null ? latest.f - prev7.f : null,
      burnChange7d:
        latest?.b != null && prev7?.b != null ? latest.b - prev7.b : null,
      samples: series.length,
      oldest: series[0]?.ts ?? null,
    };
  }
  return out;
}

/** Chain-level deltas from the same series. */
export function deriveChainHistory(series) {
  if (!Array.isArray(series) || series.length < 2) return {};
  const now = Date.now();
  const day = 86400000;
  const older = (ms) => {
    for (let i = series.length - 1; i >= 0; i--) if (now - series[i].ts >= ms) return series[i];
    return null;
  };
  const latest = series[series.length - 1]?.chain;
  const ref7 = older(7 * day)?.chain;
  const pct = (c, p) => (c != null && p != null && p !== 0 ? ((c - p) / p) * 100 : null);
  return {
    tvlChange7d: pct(latest?.tvl, ref7?.tvl),
    tvlSpark: series.slice(-48).map(s => s.chain?.tvl).filter(v => typeof v === 'number'),
  };
}

/** Shared guard for cron-triggered endpoints. */
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → allow (dev / first deploy)
  const header = req.headers.get?.('authorization') ?? req.headers?.authorization;
  if (header === `Bearer ${secret}`) return true;
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('secret') === secret;
  } catch {
    return false;
  }
}
