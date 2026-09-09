/**
 * Snapshot cron for the Robinhood tab.
 *
 * The upstream APIs report levels, never growth — there is no endpoint anywhere
 * that answers "is this token's liquidity up week over week". This writes a small
 * row per run into Redis so the aggregate can derive deltas and sparklines.
 *
 * Field names are single letters on purpose: a row is written every 30 minutes
 * and 720 of them are kept.
 *
 *   GET /api/robinhood-snapshot   (Vercel cron, or CRON_SECRET)
 */

import { buildPayload } from './_lib/rh-aggregate.js';
import { appendSnapshot, isAuthorizedCron } from './_lib/rh-store.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const respond = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (!isAuthorizedCron(req)) return respond(401, { error: 'Unauthorized' });

  try {
    const payload = await buildPayload();
    if (payload.coverage.priced === 0) {
      return respond(503, { error: 'Upstreams returned nothing; refusing to write an empty row' });
    }

    const tokens = {};
    for (const t of payload.tokens) {
      tokens[t.symbol] = {
        p: t.price,            // price
        m: t.marketCap,        // market cap
        l: t.liquidity,        // aggregate LP depth
        v: t.volume24h,        // aggregate 24h volume
        b: t.burnPct,          // % of supply burned
        f: t.followers,        // X followers
        n: t.primary?.value ?? null, // resolved primary metric
      };
    }

    const snapshot = {
      ts: Date.now(),
      chain: {
        tvl: payload.chain?.tvl ?? null,
        fees24h: payload.chain?.fees24h ?? null,
        dexVolume24h: payload.chain?.dexVolume24h ?? null,
        stablecoinMcap: payload.chain?.stablecoinMcap ?? null,
      },
      tokens,
    };

    const kept = await appendSnapshot(snapshot);
    if (kept === false) {
      return respond(503, { error: 'No Redis configured; snapshot not stored' });
    }

    return respond(200, {
      ok: true,
      ts: snapshot.ts,
      tokensRecorded: Object.keys(tokens).length,
      priced: payload.coverage.priced,
      seriesLength: kept,
    });
  } catch (e) {
    console.error('[RH] snapshot failed:', e);
    return respond(500, { error: e.message });
  }
}
