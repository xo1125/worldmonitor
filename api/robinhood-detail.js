/**
 * Per-token drill-down for the Robinhood tab.
 *
 * The watchlist answers "what is this worth"; this answers "why". It pulls the
 * full fee/revenue history from DefiLlama, derives a revenue multiple against
 * market cap, and adds CoinGecko's attention figures — fetched here, one token
 * at a time, because CoinGecko's free tier cannot take 22 calls per refresh.
 *
 *   GET /api/robinhood-detail?symbol=PONS
 */

import { RH_TOKENS, RH_EXPLORER } from './_lib/rh-tokens.js';
import { getJSON, fetchDexScreener, fetchOnchain, fetchProtocols } from './_lib/rh-sources.js';

export const config = { runtime: 'edge' };

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/**
 * CoinGecko attention figures for one token.
 *
 * Uses the contract lookup rather than resolving through /coins/list: that list
 * is ~10MB with platforms included and does not reliably complete inside the
 * edge runtime, which is why attention came back null in production.
 */
async function fetchAttention(address) {
  const c = await getJSON(
    `https://api.coingecko.com/api/v3/coins/robinhood/contract/${address}`,
    { timeoutMs: 15000 }
  );
  if (!c || !c.id) return null;
  return {
    coingeckoId: c.id,
    // CoinGecko stopped populating twitter_followers, so these are the live
    // attention signals it still serves. Not follower counts — a different thing.
    watchlistUsers: c.watchlist_portfolio_users ?? null,
    sentimentUp: c.sentiment_votes_up_percentage ?? null,
    sentimentDown: c.sentiment_votes_down_percentage ?? null,
    rank: c.market_cap_rank ?? null,
    twitterHandle: c.links?.twitter_screen_name || null,
    homepage: (c.links?.homepage || []).filter(Boolean)[0] || null,
    categories: (c.categories || []).filter(Boolean).slice(0, 4),
  };
}

/** Daily fee and revenue series, aligned by timestamp. */
function alignSeries(feeChart, revChart, days = 30) {
  const revByTs = new Map((revChart || []).map(([ts, v]) => [ts, v]));
  return (feeChart || []).slice(-days).map(([ts, fees]) => ({
    ts: ts * 1000,
    fees: fees ?? null,
    revenue: revByTs.get(ts) ?? null,
  }));
}

export default async function handler(req) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  const token = RH_TOKENS.find(t => t.symbol.toUpperCase() === symbol);

  const json = (body, status = 200, cacheState = 'MISS') =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
        'X-Cache': cacheState,
      },
    });

  if (!token) return json({ error: `Unknown symbol "${symbol}"` }, 404, 'NONE');

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return json(hit.data, 200, 'HIT');

  try {
    const slug = token.llamaSlug;
    const [dexByAddress, onchainByAddress, feeSummary, revSummary, attention, protocols] = await Promise.all([
      fetchDexScreener([token.address]),
      fetchOnchain([token]),
      slug ? getJSON(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`) : null,
      slug ? getJSON(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`) : null,
      fetchAttention(token.address),
      slug ? fetchProtocols([slug]) : null,
    ]);

    const dex = dexByAddress[token.address.toLowerCase()] || null;
    const onchain = onchainByAddress[token.address.toLowerCase()] || null;

    // Annualise from the last 30 days rather than DefiLlama's 1y figure: these
    // protocols are weeks old, so a trailing-year number understates them badly.
    const annualizedRevenue = revSummary?.total30d != null ? revSummary.total30d * 12.17 : null;
    const annualizedFees = feeSummary?.total30d != null ? feeSummary.total30d * 12.17 : null;
    const marketCap = dex?.marketCap ?? null;

    const data = {
      symbol: token.symbol,
      project: token.project,
      type: token.type,
      conviction: token.conviction,
      note: token.note || null,
      // CoinGecko has no description for tokens this new, so DefiLlama's
      // protocol blurb is the only real prose available. The registry note
      // carries the judgement that isn't in any API.
      description: (feeSummary?.description || protocols?.[slug]?.description || '')
        .replace(/\s+/g, ' ')
        .trim() || null,
      primaryMetric: token.primaryMetric || null,
      // How DefiLlama actually computes these numbers. Parent protocols keep it
      // on their children (Pons files everything under V1/V2), so fall through.
      methodology: (() => {
        // Merge across versions: Pons V2 documents its revenue split but drops
        // the holder note that V1 carries, so taking only the newest loses it.
        const sources = [
          ...(feeSummary?.childProtocols || []).map(c => c.methodology).filter(Boolean),
          feeSummary?.methodology,
        ].filter(Boolean);
        const m = sources.length ? Object.assign({}, ...sources) : null;
        if (!m) return null;
        return {
          fees: m.Fees || null,
          revenue: m.Revenue || null,
          holders: m.HoldersRevenue || null,
          supplySide: m.SupplySideRevenue || null,
          url: feeSummary?.methodologyURL
            || feeSummary?.childProtocols?.filter(c => c.methodologyURL).at(-1)?.methodologyURL
            || null,
        };
      })(),
      handle: token.handle || null,
      address: token.address,
      links: {
        chart: dex?.topPair || `https://dexscreener.com/robinhood/${token.address}`,
        explorer: `${RH_EXPLORER}/token/${token.address}`,
        defillama: slug ? `https://defillama.com/protocol/${slug}` : null,
        x: token.handle ? `https://x.com/${token.handle}` : null,
      },

      market: {
        price: dex?.price ?? null,
        change1h: dex?.priceChange?.h1 ?? null,
        change6h: dex?.priceChange?.h6 ?? null,
        change24h: dex?.priceChange?.h24 ?? null,
        marketCap,
        fdv: dex?.fdv ?? null,
        liquidity: dex?.liquidity ?? null,
        volume24h: dex?.volume24h ?? null,
        turnover: dex?.liquidity ? (dex.volume24h || 0) / dex.liquidity : null,
        pairCount: dex?.pairCount ?? null,
        dexes: dex?.dexes ?? [],
        buys24h: dex?.buys24h ?? 0,
        sells24h: dex?.sells24h ?? 0,
      },

      economics: slug && feeSummary ? {
        slug,
        fees24h: feeSummary.total24h ?? null,
        fees7d: feeSummary.total7d ?? null,
        fees30d: feeSummary.total30d ?? null,
        revenue24h: revSummary?.total24h ?? null,
        revenue7d: revSummary?.total7d ?? null,
        revenue30d: revSummary?.total30d ?? null,
        annualizedFees,
        annualizedRevenue,
        // What the protocol keeps of what it charges.
        capture30d: feeSummary.total30d ? (revSummary?.total30d ?? 0) / feeSummary.total30d : null,
        // The valuation question: how many years of current revenue is the
        // market cap. Null when there is no revenue to divide by.
        revenueMultiple: marketCap && annualizedRevenue ? marketCap / annualizedRevenue : null,
        feesMultiple: marketCap && annualizedFees ? marketCap / annualizedFees : null,
        allTimeFees: feeSummary.totalAllTime ?? null,
        series: alignSeries(feeSummary.totalDataChart, revSummary?.totalDataChart, 30),
      } : null,

      // Reserve-backed names have no fees at all — backing per token is the
      // whole thesis, so the drill-down would be empty without this.
      treasury: (() => {
        const p = slug ? protocols?.[slug] : null;
        if (!p || p.holdings == null) return null;
        const circulating = onchain?.circulating ?? null;
        const backing = circulating ? p.holdings / circulating : null;
        return {
          holdings: p.holdings,
          tvl: p.tvl,
          staking: p.staking,
          borrowed: p.borrowed,
          utilisation: p.utilisation,
          tvlChange7d: p.tvlChange7d,
          backingPerToken: backing,
          // Under 1.00x the token trades above what backs it.
          backingVsPrice: backing && dex?.price ? backing / dex.price : null,
        };
      })(),

      onchain: onchain ? {
        supply: onchain.supply,
        burned: onchain.burned,
        burnPct: onchain.burnPct,
        circulating: onchain.circulating,
      } : null,

      attention,
      updatedAt: new Date().toISOString(),
    };

    cache.set(symbol, { data, ts: Date.now() });
    return json(data);
  } catch (e) {
    console.error(`[RH] detail ${symbol} failed:`, e);
    return json({ error: e.message }, 500, 'ERROR');
  }
}
