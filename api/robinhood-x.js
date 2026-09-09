/**
 * X (Twitter) follower counts for Robinhood Chain projects, via Apify.
 *
 * X is the one metric on the watchlist with no free API, so an Apify actor does
 * the scraping on a slow cron and the result is cached in Redis. Reads are served
 * from cache only — a page load never waits on an actor run.
 *
 *   GET /api/robinhood-x               → cached counts (+ 7d deltas)
 *   GET /api/robinhood-x?refresh=1     → trigger an actor run (cron / CRON_SECRET only)
 *
 * Env:
 *   APIFY_TOKEN     required to refresh
 *   APIFY_X_ACTOR   actor id, default apidojo~twitter-user-scraper
 *   APIFY_X_INPUT_KEY  input field holding the handle list, default twitterHandles
 */

import { RH_X_HANDLES } from './_lib/rh-tokens.js';
import { KEYS, readJSON, writeJSON, isAuthorizedCron } from './_lib/rh-store.js';

export const config = { maxDuration: 60 };

const DEFAULT_ACTOR = 'apidojo~twitter-user-scraper';
const CACHE_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Actors disagree about field names, so pull the first shape that matches
 * rather than betting the endpoint on one actor's schema.
 */
function normalizeItem(item) {
  const handle =
    item.userName || item.username || item.screen_name || item.handle ||
    item.legacy?.screen_name || item.author?.userName || null;
  const followers =
    item.followers ?? item.followersCount ?? item.followers_count ??
    item.legacy?.followers_count ?? item.public_metrics?.followers_count ??
    item.author?.followers ?? null;
  if (!handle || followers == null) return null;

  return {
    handle: String(handle).replace(/^@/, ''),
    followers: Number(followers),
    following: Number(
      item.following ?? item.followingCount ?? item.friends_count ??
      item.legacy?.friends_count ?? 0
    ) || null,
    tweets: Number(
      item.statusesCount ?? item.statuses_count ?? item.legacy?.statuses_count ?? 0
    ) || null,
    name: item.name || item.legacy?.name || null,
    verified: Boolean(item.isVerified ?? item.verified ?? item.legacy?.verified ?? false),
    createdAt: item.createdAt || item.legacy?.created_at || null,
  };
}

// The actor silently drops profiles on large batches: 17 handles in one run
// returned only 10, while the same 7 stragglers all resolved in a batch of 7.
const HANDLES_PER_RUN = 8;

async function runApifyBatch(handles, token) {
  const actor = process.env.APIFY_X_ACTOR || DEFAULT_ACTOR;
  const inputKey = process.env.APIFY_X_INPUT_KEY || 'twitterHandles';
  const input = {
    [inputKey]: handles,
    // Generous: the dataset carries more rows than profiles, and a tight cap is
    // what truncated the results in the first place.
    maxItems: handles.length * 4,
    getFollowers: false,
    getFollowing: false,
  };

  // Only pin memory when explicitly configured: actors declare a minimum and
  // an under-spec value is rejected outright (1024 fails on the default actor).
  const memoryMb = process.env.APIFY_X_MEMORY_MB;
  const url =
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=50&format=json` +
    (memoryMb ? `&memory=${encodeURIComponent(memoryMb)}` : '');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify ${res.status}: ${body.slice(0, 300)}`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Apify returned a non-array dataset');

  // Paid ("rental") actors emit {demo:true} rows once the trial lapses and the
  // run still reports SUCCEEDED — without this check it looks like a parser bug.
  if (items.length > 0 && items.every(i => i?.demo === true)) {
    throw new Error(
      `actor "${actor}" returned demo data — the Apify account is not subscribed to it. ` +
      'Rent the actor, or set APIFY_X_ACTOR to a free alternative.'
    );
  }

  return items.map(normalizeItem).filter(Boolean);
}

async function runApify(handles) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set');

  const batches = [];
  for (let i = 0; i < handles.length; i += HANDLES_PER_RUN) {
    batches.push(handles.slice(i, i + HANDLES_PER_RUN));
  }

  // Two at a time: fully parallel runs trip the account's concurrent-run limit,
  // while fully sequential runs would exceed the 60s function cap.
  const CONCURRENCY = 2;
  const results = [];
  const failures = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const wave = batches.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(wave.map(b => runApifyBatch(b, token)));
    for (const [j, outcome] of settled.entries()) {
      if (outcome.status === 'fulfilled') results.push(...outcome.value);
      else failures.push(`batch ${i + j + 1}: ${outcome.reason?.message || outcome.reason}`);
    }
  }
  if (results.length === 0) {
    throw new Error(`no usable profiles — ${failures.join('; ') || 'actor returned nothing'}`);
  }
  if (failures.length) console.warn('[RH-X] partial batch failure:', failures.join('; '));

  // Deduplicate: overlapping batches or actor retries can repeat a profile.
  const byHandle = new Map();
  for (const r of results) byHandle.set(r.handle.toLowerCase(), r);
  return { profiles: [...byHandle.values()], failures };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const refresh = url.searchParams.get('refresh') === '1';

  if (!refresh) {
    const social = (await readJSON(KEYS.social, {})) || {};
    return json(res, 200, {
      handles: social,
      count: Object.keys(social).length,
      cached: true,
    });
  }

  if (!isAuthorizedCron(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    const { profiles: results, failures } = await runApify(RH_X_HANDLES);
    if (results.length === 0) throw new Error('actor returned no usable profiles');

    // Keep the previous poll so the aggregate can report follower deltas even
    // before the snapshot history is deep enough.
    const previous = (await readJSON(KEYS.social, {})) || {};
    await writeJSON(KEYS.socialPrev, previous, CACHE_TTL_SECONDS);

    const ts = Date.now();
    const social = {};
    for (const r of results) {
      const key = r.handle.toLowerCase();
      social[key] = {
        ...r,
        ts,
        previousFollowers: previous[key]?.followers ?? null,
        change: previous[key]?.followers != null ? r.followers - previous[key].followers : null,
      };
    }
    await writeJSON(KEYS.social, social, CACHE_TTL_SECONDS);

    return json(res, 200, {
      refreshed: true,
      requested: RH_X_HANDLES.length,
      resolved: results.length,
      missing: RH_X_HANDLES.filter(h => !social[h.toLowerCase()]),
      failures,
      handles: social,
    });
  } catch (e) {
    console.error('[RH-X] refresh failed:', e.message);
    const social = (await readJSON(KEYS.social, {})) || {};
    return json(res, 502, { error: e.message, handles: social, stale: true });
  }
}
