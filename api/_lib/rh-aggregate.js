// Builds the full Robinhood Chain payload. Shared by the read endpoint
// (/api/robinhood-watchlist) and the snapshot cron (/api/robinhood-snapshot)
// so both see exactly the same numbers.

import { RH_TOKENS, RH_PROTOCOLS, RH_EXPLORER } from './rh-tokens.js';
import { fetchDexScreener, fetchChainVitals, fetchProtocols, fetchOnchain } from './rh-sources.js';
import { KEYS, readJSON, readHistory, deriveHistory, deriveChainHistory } from './rh-store.js';

/** Resolve one metric slot (primary or secondary) into a displayable value. */
function resolveMetric(source, ctx) {
  if (!source || source === 'none') return { kind: null, value: null, source: 'unavailable' };
  const { token, dex, chain, protocols, onchain, social } = ctx;

  // Reserve-backed tokens: DefiLlama already values the treasury as protocol TVL,
  // so backing per token is that TVL over circulating supply — the RFV floor,
  // without needing the treasury address.
  if (source === 'derived:backing') {
    // holdings = TVL + staking, because a reserve protocol books its treasury
    // under staking (NetNet reports 0 TVL and ~$57M staking).
    const holdings = token.llamaSlug ? protocols[token.llamaSlug]?.holdings : null;
    const circulating = onchain?.circulating;
    if (holdings != null && circulating) {
      const backing = holdings / circulating;
      return {
        kind: 'usdPerToken', value: backing,
        sub: dex?.price ? backing / dex.price : null, subLabel: 'x price',
        source: 'defillama+rpc',
        url: `https://defillama.com/protocol/${token.llamaSlug}`,
      };
    }
    return { kind: null, value: null, source: 'defillama+rpc', note: 'treasury TVL unavailable' };
  }

  if (source === 'derived:utilisation') {
    const p = token.llamaSlug ? protocols[token.llamaSlug] : null;
    if (p?.utilisation != null) {
      return { kind: 'pct', value: p.utilisation * 100, sub: p.borrowed, subLabel: 'borrowed',
               source: 'defillama', url: p.url };
    }
    return { kind: null, value: null, source: 'defillama', note: 'borrowed not broken out' };
  }

  if (source.startsWith('defillama:')) {
    const slug = source.slice('defillama:'.length);
    const p = protocols[slug];
    if (!p) return { kind: null, value: null, source: 'defillama', note: 'no adapter' };
    // Prefer revenue (value actually captured), fall back to fees, then TVL.
    if (p.revenue24h != null && p.revenue24h > 0) {
      return { kind: 'usd', value: p.revenue24h, sub: p.revenue30d, subLabel: '30d',
               source: 'defillama', url: p.url };
    }
    if (p.fees24h != null) {
      return { kind: 'usd', value: p.fees24h, sub: p.fees30d, subLabel: '30d fees',
               source: 'defillama', url: p.url };
    }
    if (p.holdings != null) {
      return { kind: 'usd', value: p.holdings, sub: p.tvlChange7d, subLabel: '7d change',
               source: 'defillama', url: p.url };
    }
    return { kind: null, value: null, source: 'defillama' };
  }

  if (source === 'onchain:burn') {
    return onchain?.burnPct != null
      ? { kind: 'pct', value: onchain.burnPct, sub: onchain.burned, subLabel: 'tokens', source: 'rpc' }
      : { kind: null, value: null, source: 'rpc' };
  }

  if (source === 'onchain:treasury') {
    const { reservePrice } = ctx;
    if (onchain?.reserveBalance != null && reservePrice && onchain.circulating) {
      const backingUsd = onchain.reserveBalance * reservePrice;
      return {
        kind: 'usdPerToken', value: backingUsd / onchain.circulating,
        sub: backingUsd, subLabel: `${onchain.reserveSymbol || 'reserve'} vault`,
        source: 'rpc',
      };
    }
    if (onchain?.backingPerToken != null) {
      // Balance without a price: still report it, in reserve-asset units.
      return { kind: 'usdPerToken', value: onchain.backingPerToken, sub: onchain.reserveBalance,
               subLabel: `${onchain.reserveSymbol || 'reserve'} held`, source: 'rpc' };
    }
    return { kind: null, value: null, source: 'rpc', note: 'treasury address not set' };
  }

  if (source === 'dex:liquidity') {
    return dex?.liquidity
      ? { kind: 'usd', value: dex.liquidity, sub: dex.pairCount, subLabel: 'pairs', source: 'dexscreener' }
      : { kind: null, value: null, source: 'dexscreener' };
  }

  if (source === 'dex:volume') {
    return dex?.volume24h != null
      ? { kind: 'usd', value: dex.volume24h, source: 'dexscreener' }
      : { kind: null, value: null, source: 'dexscreener' };
  }

  if (source === 'social') {
    return social?.followers != null
      ? { kind: 'count', value: social.followers, source: 'apify' }
      : { kind: null, value: null, source: 'apify', note: 'not polled yet' };
  }

  if (source === 'chain:fees') {
    return chain?.fees24h != null ? { kind: 'usd', value: chain.fees24h, source: 'defillama' } : null;
  }

  return { kind: null, value: null, source: 'unavailable' };
}

export async function buildPayload() {
  const addresses = RH_TOKENS.map(t => t.address);
  // Reserve assets are priced too: 1,290 NVDA means nothing until it is dollars.
  const reserveAddresses = [...new Set(
    RH_TOKENS.map(t => t.reserveToken).filter(Boolean).map(a => a.toLowerCase())
  )].filter(a => !addresses.some(x => x.toLowerCase() === a));
  const slugs = [
    ...new Set([
      ...RH_TOKENS.map(t => t.llamaSlug).filter(Boolean),
      ...RH_PROTOCOLS.map(p => p.slug),
    ]),
  ];

  const [dexByAddress, chain, protocolResult, onchainByAddress, social, series] = await Promise.all([
    fetchDexScreener([...addresses, ...reserveAddresses]),
    fetchChainVitals(),
    fetchProtocols(slugs),
    fetchOnchain(RH_TOKENS),
    readJSON(KEYS.social, {}),
    readHistory(),
  ]);

  const protocols = protocolResult?.bySlug || {};
  const leaders = protocolResult?.leaders || [];

  const history = deriveHistory(series, RH_TOKENS.map(t => t.symbol));
  const chainHistory = deriveChainHistory(series);

  const tokens = RH_TOKENS.map(t => {
    const key = t.address.toLowerCase();
    const dex = dexByAddress[key] || null;
    const onchain = onchainByAddress[key] || null;
    const reservePrice = t.reserveToken
      ? dexByAddress[t.reserveToken.toLowerCase()]?.price ?? null
      : null;
    const socialEntry = t.handle ? (social?.[t.handle.toLowerCase()] || null) : null;
    const ctx = { token: t, dex, chain, protocols, onchain, social: socialEntry, reservePrice };
    const hist = history[t.symbol] || {};

    const buys = dex?.buys24h ?? 0;
    const sells = dex?.sells24h ?? 0;
    const txns = buys + sells;

    return {
      symbol: t.symbol,
      address: t.address,
      project: t.project,
      type: t.type,
      conviction: t.conviction,
      handle: t.handle || null,
      note: t.note || null,
      explorerUrl: `${RH_EXPLORER}/token/${t.address}`,
      chartUrl: dex?.topPair || `https://dexscreener.com/robinhood/${t.address}`,

      price: dex?.price ?? null,
      change1h: dex?.priceChange?.h1 ?? null,
      change6h: dex?.priceChange?.h6 ?? null,
      change24h: dex?.priceChange?.h24 ?? null,
      marketCap: dex?.marketCap ?? null,
      fdv: dex?.fdv ?? null,
      liquidity: dex?.liquidity ?? null,
      volume24h: dex?.volume24h ?? null,
      // Volume/liquidity turnover: high ratio on thin liquidity is the churn tell.
      turnover: dex?.liquidity ? (dex.volume24h || 0) / dex.liquidity : null,
      pairCount: dex?.pairCount ?? null,
      dexes: dex?.dexes ?? [],
      buys24h: buys,
      sells24h: sells,
      buyRatio: txns > 0 ? buys / txns : null,

      supply: onchain?.supply ?? null,
      burned: onchain?.burned ?? null,
      burnPct: onchain?.burnPct ?? null,
      backingPerToken: onchain?.backingPerToken ?? null,
      reserveBalance: onchain?.reserveBalance ?? null,
      reserveSymbol: onchain?.reserveSymbol ?? null,
      // Backing as a share of market cap — the honest read on "asset-backed" claims.
      reservePrice,
      // Backing as a share of market cap — the honest read on "asset-backed".
      backingRatio:
        onchain?.reserveBalance != null && reservePrice && dex?.marketCap
          ? (onchain.reserveBalance * reservePrice) / dex.marketCap
          : null,

      followers: socialEntry?.followers ?? null,
      followersChange7d: hist.followersChange7d ?? null,

      primary: { label: t.primaryMetric, ...resolveMetric(t.metricSource, ctx) },
      secondary: { label: t.secondaryMetric, ...resolveMetric(t.secondarySource, ctx) },

      spark: hist.spark ?? [],
      mcapChange7d: hist.mcapChange7d ?? null,
      liqChange24h: hist.liqChange24h ?? null,
      liqChange7d: hist.liqChange7d ?? null,
      burnChange7d: hist.burnChange7d ?? null,
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    chain: { ...chain, ...chainHistory },
    tokens,
    // Watchlist protocols first (they carry the token tag), then everything else
    // the chain earns on, so the ranking is the chain's and not just ours.
    protocols: (() => {
      const tagged = Object.fromEntries(RH_PROTOCOLS.map(p => [p.slug, p]));
      const merged = leaders.map(l => ({ ...l, token: tagged[l.slug]?.token ?? null }));
      const seen = new Set(merged.map(p => p.slug));
      const missing = RH_PROTOCOLS
        .filter(p => !seen.has(p.slug))
        .map(p => ({ ...p, ...(protocols[p.slug] || {}) }))
        .filter(p => p.name);
      return [...merged, ...missing];
    })(),
    coverage: {
      priced: tokens.filter(t => t.price != null).length,
      total: tokens.length,
      historySamples: series.length,
      socialPolled: Object.keys(social || {}).length,
    },
  };
}

const MERGE_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Fill gaps in a fresh payload from the last good one.
 *
 * A partial upstream failure (one rate-limited DexScreener call, a DefiLlama
 * blip) otherwise blanks whole panels even though the previous numbers were
 * fine seconds earlier. Only null fields are filled, so a token that genuinely
 * has no market stays empty, and anything filled is flagged.
 */
export function mergeWithPrevious(fresh, previous) {
  if (!previous || !Array.isArray(previous.tokens)) return fresh;
  const age = Date.now() - new Date(previous.updatedAt).getTime();
  if (!Number.isFinite(age) || age > MERGE_MAX_AGE_MS) return fresh;

  let filled = 0;
  const prevTokens = Object.fromEntries(previous.tokens.map(t => [t.symbol, t]));
  const MARKET_FIELDS = ['price', 'change24h', 'change6h', 'change1h', 'marketCap', 'fdv',
                         'liquidity', 'volume24h', 'turnover', 'pairCount'];
  const CHAIN_FIELDS = Object.keys(previous.chain || {});

  const chain = { ...fresh.chain };
  for (const key of CHAIN_FIELDS) {
    if (chain[key] == null && previous.chain[key] != null) {
      chain[key] = previous.chain[key];
      filled++;
    }
  }

  const tokens = fresh.tokens.map(token => {
    const prev = prevTokens[token.symbol];
    if (!prev) return token;
    const merged = { ...token };
    let tokenFilled = false;

    for (const field of MARKET_FIELDS) {
      if (merged[field] == null && prev[field] != null) {
        merged[field] = prev[field];
        tokenFilled = true;
      }
    }
    if (merged.burnPct == null && prev.burnPct != null) {
      merged.burnPct = prev.burnPct;
      merged.burned = prev.burned;
      merged.supply = prev.supply;
      tokenFilled = true;
    }
    for (const slot of ['primary', 'secondary']) {
      if (merged[slot]?.value == null && prev[slot]?.value != null) {
        merged[slot] = { ...prev[slot], carried: true };
        tokenFilled = true;
      }
    }
    if (tokenFilled) {
      merged.carried = true;
      filled++;
    }
    return merged;
  });

  const protocols = fresh.protocols.map(p => {
    const prev = (previous.protocols || []).find(x => x.slug === p.slug);
    if (!prev) return p;
    const merged = { ...p };
    for (const key of ['tvl', 'staking', 'holdings', 'borrowed', 'utilisation',
                       'fees24h', 'fees7d', 'revenue24h', 'tvlChange7d']) {
      if (merged[key] == null && prev[key] != null) {
        merged[key] = prev[key];
        filled++;
      }
    }
    return merged;
  });

  return {
    ...fresh,
    chain,
    tokens,
    protocols,
    coverage: { ...fresh.coverage, priced: tokens.filter(t => t.price != null).length },
    carriedFields: filled || undefined,
  };
}
