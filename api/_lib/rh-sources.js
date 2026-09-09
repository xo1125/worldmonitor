// Data sources for the Robinhood Chain tab.
// Every upstream here is free and keyless:
//   DexScreener  — price / mcap / LP depth / volume / txns   (300 req/min)
//   DefiLlama    — chain TVL, fees, DEX volume, protocol fees (no key)
//   Public RPC   — supply, burns, treasury balances           (chainId 4663)
// Note: the chain's Blockscout instance sits behind Cloudflare, so holder
// counts are deliberately not sourced here.

import { DEXSCREENER_CHAIN, RH_RPC_URLS } from './rh-tokens.js';

const UA = 'fcmonitor/2.2 (+https://www.fcmonitor.com)';

/** fetch + JSON with a hard timeout; resolves to null instead of throwing. */
export async function getJSON(url, { timeoutMs = 12000, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': UA, ...(init.headers || {}) },
    });
    if (!res.ok) {
      console.warn(`[RH] ${res.status} from ${url.slice(0, 120)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[RH] fetch failed ${url.slice(0, 120)}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── DexScreener ────────────────────────────────────────────────────────────
// /latest/dex/tokens returns EVERY pair for the addresses but caps the response
// at 30 pairs, so we chunk small and aggregate liquidity + volume across pairs.
// Aggregating matters: PONS reads $7.8M liquidity on its deepest pair and
// $26.5M across all 17 of them.

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchDexScreener(addresses) {
  // One address per request: the endpoint caps each response at 30 pairs, and a
  // deep token like PONS has 17 on its own — batching silently drops pairs and
  // understates aggregate liquidity and volume.
  const responses = await mapLimit(addresses, 6, addr =>
    getJSON(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)
  );

  const byAddress = {};
  for (const res of responses) {
    for (const pair of res?.pairs || []) {
      if (pair.chainId !== DEXSCREENER_CHAIN) continue;
      const key = pair.baseToken?.address?.toLowerCase();
      if (!key) continue;

      const entry = (byAddress[key] ||= {
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        price: null, priceChange: {}, marketCap: null, fdv: null,
        liquidity: 0, volume24h: 0, volume6h: 0,
        buys24h: 0, sells24h: 0, pairCount: 0,
        topPair: null, topPairLiquidity: 0, dexes: new Set(),
        pairCreatedAt: null,
      });

      const liq = pair.liquidity?.usd || 0;
      entry.liquidity += liq;
      entry.volume24h += pair.volume?.h24 || 0;
      entry.volume6h += pair.volume?.h6 || 0;
      entry.buys24h += pair.txns?.h24?.buys || 0;
      entry.sells24h += pair.txns?.h24?.sells || 0;
      entry.pairCount += 1;
      if (pair.dexId) entry.dexes.add(pair.dexId);
      if (pair.pairCreatedAt && (!entry.pairCreatedAt || pair.pairCreatedAt < entry.pairCreatedAt)) {
        entry.pairCreatedAt = pair.pairCreatedAt;
      }

      // Price / mcap come from the deepest pair — thin pairs print noisy prices.
      if (liq >= entry.topPairLiquidity) {
        entry.topPairLiquidity = liq;
        entry.topPair = pair.url || null;
        entry.price = pair.priceUsd ? Number(pair.priceUsd) : null;
        entry.priceChange = {
          h1: pair.priceChange?.h1 ?? null,
          h6: pair.priceChange?.h6 ?? null,
          h24: pair.priceChange?.h24 ?? null,
        };
        entry.marketCap = pair.marketCap ?? null;
        entry.fdv = pair.fdv ?? null;
      }
    }
  }

  for (const entry of Object.values(byAddress)) {
    entry.dexes = [...entry.dexes].sort();
  }
  return byAddress;
}

// ── DefiLlama ──────────────────────────────────────────────────────────────

const LLAMA_CHAIN = 'Robinhood%20Chain';
const CHAIN_NAME = 'Robinhood Chain';

export async function fetchChainVitals() {
  const [fees, dexs, chains, stables] = await Promise.all([
    getJSON(`https://api.llama.fi/overview/fees/${LLAMA_CHAIN}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`),
    getJSON(`https://api.llama.fi/overview/dexs/${LLAMA_CHAIN}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`),
    getJSON('https://api.llama.fi/v2/chains'),
    getJSON('https://stablecoins.llama.fi/stablecoinchains'),
  ]);

  const chain = (chains || []).find(c => c.name === CHAIN_NAME);
  const stableRow = (stables || []).find(
    c => c.name === CHAIN_NAME || c.gecko_id === 'robinhood-chain'
  );
  const stableMcap = stableRow?.totalCirculatingUSD
    ? Object.values(stableRow.totalCirculatingUSD).reduce((a, b) => a + (b || 0), 0)
    : null;

  return {
    tvl: chain?.tvl ?? null,
    fees24h: fees?.total24h ?? null,
    fees7d: fees?.total7d ?? null,
    fees30d: fees?.total30d ?? null,
    feesChange1d: fees?.change_1d ?? null,
    feesChange7d: fees?.change_7d ?? null,
    dexVolume24h: dexs?.total24h ?? null,
    dexVolume7d: dexs?.total7d ?? null,
    dexVolume30d: dexs?.total30d ?? null,
    dexChange1d: dexs?.change_1d ?? null,
    dexChange7d: dexs?.change_7d ?? null,
    appCount: fees?.protocols?.length ?? null,
    dexCount: dexs?.protocols?.length ?? null,
    stablecoinMcap: stableMcap,
  };
}

/**
 * Fundamentals for the protocols behind watchlist tokens.
 *
 * Three calls cover almost everything: /protocols carries TVL, staking and
 * borrowed for every protocol at once, and the two chain fee overviews carry
 * per-protocol fees and revenue. Only protocols missing from the overview
 * (parent protocols like Pons, whose fees are filed under its V1/V2 children)
 * need an individual summary call.
 */
export async function fetchProtocols(slugs) {
  const [all, feeOverview, revOverview] = await Promise.all([
    getJSON('https://api.llama.fi/protocols', { timeoutMs: 20000 }),
    getJSON(`https://api.llama.fi/overview/fees/${LLAMA_CHAIN}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`),
    getJSON(`https://api.llama.fi/overview/fees/${LLAMA_CHAIN}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue`),
  ]);

  const bySlug = {};
  for (const p of all || []) if (p.slug) bySlug[p.slug] = p;
  const feeBySlug = {};
  for (const p of feeOverview?.protocols || []) if (p.slug) feeBySlug[p.slug] = p;
  const revBySlug = {};
  for (const p of revOverview?.protocols || []) if (p.slug) revBySlug[p.slug] = p;

  const missingFees = slugs.filter(s => !feeBySlug[s]);
  const summaries = await Promise.all(
    missingFees.map(async slug => {
      const [f, r] = await Promise.all([
        getJSON(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`),
        getJSON(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`),
      ]);
      return [slug, f, r];
    })
  );
  for (const [slug, f, r] of summaries) {
    if (f) feeBySlug[slug] = f;
    if (r) revBySlug[slug] = r;
  }

  // Chain-wide earners, not just the watchlist's protocols: the point of the
  // panel is who makes money on this chain, and 157 are tracked.
  // Roll versions up to their parent (Pons V1 + V2 are one business, and the
  // chain itself is not an app competing with them).
  const grouped = new Map();
  for (const p of feeOverview?.protocols || []) {
    if (p.protocolType === 'chain') continue;
    if ((p.total24h ?? 0) <= 0) continue;

    const parentSlug = p.parentProtocol ? p.parentProtocol.replace(/^parent#/, '') : p.slug;
    const isChild = Boolean(p.parentProtocol);
    const name = isChild
      ? (p.displayName || p.name || parentSlug).replace(/\s+V\d+$/i, '')
      : (p.displayName || p.name || p.slug);

    const rev = revBySlug[p.slug];
    const entry = grouped.get(parentSlug) || {
      slug: parentSlug, name, category: p.category ?? null,
      fees24h: 0, fees7d: 0, fees30d: 0, revenue24h: 0, revenue30d: 0,
      versions: 0, tvl: bySlug[parentSlug]?.tvl ?? null,
      url: `https://defillama.com/protocol/${parentSlug}`,
    };
    entry.fees24h += p.total24h ?? 0;
    entry.fees7d += p.total7d ?? 0;
    entry.fees30d += p.total30d ?? 0;
    entry.revenue24h += rev?.total24h ?? 0;
    entry.revenue30d += rev?.total30d ?? 0;
    entry.versions += 1;
    grouped.set(parentSlug, entry);
  }

  const leaders = [...grouped.values()]
    .sort((a, b) => b.fees24h - a.fees24h)
    .slice(0, 30);

  const out = {};
  for (const slug of slugs) {
    const base = bySlug[slug];
    const fee = feeBySlug[slug];
    const rev = revBySlug[slug];
    if (!base && !fee) continue;

    const chainTvls = base?.chainTvls || {};
    // A reserve protocol books its treasury under "staking", not "tvl" — NetNet
    // reports 0 TVL and ~$57M staking, so read both.
    const tvl = base?.tvl || null;
    const staking = chainTvls[`${CHAIN_NAME}-staking`] ?? base?.staking ?? null;
    const borrowed = chainTvls[`${CHAIN_NAME}-borrowed`] ?? null;

    out[slug] = {
      slug,
      name: base?.name || fee?.displayName || slug,
      description: base?.description || null,
      category: base?.category || fee?.category || null,
      tvl,
      staking,
      borrowed,
      // What the protocol actually holds, whichever bucket it lands in.
      holdings: (tvl || 0) + (staking || 0) || null,
      utilisation: tvl && borrowed ? borrowed / tvl : null,
      tvlChange1d: base?.change_1d ?? null,
      tvlChange7d: base?.change_7d ?? null,
      fees24h: fee?.total24h ?? null,
      fees7d: fee?.total7d ?? null,
      fees30d: fee?.total30d ?? null,
      feesChange1d: fee?.change_1d ?? null,
      revenue24h: rev?.total24h ?? null,
      revenue7d: rev?.total7d ?? null,
      revenue30d: rev?.total30d ?? null,
      url: `https://defillama.com/protocol/${slug}`,
    };
  }
  return { bySlug: out, leaders };
}

// ── Public RPC ─────────────────────────────────────────────────────────────
// Batched eth_call. Selectors: totalSupply() 0x18160ddd, decimals() 0x313ce567,
// balanceOf(address) 0x70a08231.

const BURN_ADDRESSES = [
  '0x000000000000000000000000000000000000dEaD',
  '0x0000000000000000000000000000000000000000',
];

const pad32 = (addr) => addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hexToNum = (hex) => {
  if (!hex || hex === '0x') return null;
  try { return Number(BigInt(hex)); } catch { return null; }
};

const RPC_BATCH_SIZE = 24; // one 88-call batch draws a 429 from the primary node

async function rpcBatchOnce(calls, offset) {
  const body = JSON.stringify(
    calls.map((c, i) => ({ jsonrpc: '2.0', id: offset + i, method: 'eth_call', params: [c, 'latest'] }))
  );
  for (const url of RH_RPC_URLS) {
    const res = await getJSON(url, {
      method: 'POST', body, timeoutMs: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
    if (Array.isArray(res)) return res;
    console.warn(`[RH] RPC ${url} returned no batch, trying next endpoint`);
  }
  return [];
}

async function rpcBatch(calls) {
  if (calls.length === 0) return [];
  const out = new Array(calls.length).fill(null);
  const groups = chunk(calls, RPC_BATCH_SIZE);
  let offset = 0;
  const offsets = groups.map(g => { const o = offset; offset += g.length; return o; });

  const responses = await Promise.all(groups.map((g, i) => rpcBatchOnce(g, offsets[i])));
  for (const res of responses) {
    for (const r of res) {
      if (typeof r.id === 'number' && r.id < out.length) out[r.id] = r.result ?? null;
    }
  }
  return out;
}

/**
 * Supply, burn and (where a treasury is configured) reserve backing per token.
 * Returns { [address]: { supply, burned, burnPct, backingPerToken, reserveBalance } }
 */
export async function fetchOnchain(tokens) {
  const calls = [];
  const plan = [];

  for (const t of tokens) {
    const base = calls.length;
    calls.push({ to: t.address, data: '0x18160ddd' });          // totalSupply
    calls.push({ to: t.address, data: '0x313ce567' });          // decimals
    for (const burn of BURN_ADDRESSES) {
      calls.push({ to: t.address, data: '0x70a08231' + pad32(burn) });
    }
    const entry = { token: t, supplyIdx: base, decimalsIdx: base + 1, burnIdx: [base + 2, base + 3] };

    if (t.treasury && t.reserveToken) {
      entry.reserveIdx = calls.length;
      calls.push({ to: t.reserveToken, data: '0x70a08231' + pad32(t.treasury) });
      entry.reserveDecimalsIdx = calls.length;
      calls.push({ to: t.reserveToken, data: '0x313ce567' });
    }
    plan.push(entry);
  }

  const results = await rpcBatch(calls);
  const out = {};

  for (const p of plan) {
    const decimals = hexToNum(results[p.decimalsIdx]) ?? 18;
    const scale = 10 ** decimals;
    const supplyRaw = hexToNum(results[p.supplyIdx]);
    const supply = supplyRaw == null ? null : supplyRaw / scale;
    const burned = p.burnIdx.reduce((sum, idx) => {
      const v = hexToNum(results[idx]);
      return v == null ? sum : sum + v / scale;
    }, 0);

    let reserveBalance = null;
    let backingPerToken = null;
    if (p.reserveIdx != null) {
      const rDecimals = hexToNum(results[p.reserveDecimalsIdx]) ?? 18;
      const raw = hexToNum(results[p.reserveIdx]);
      if (raw != null) {
        reserveBalance = raw / 10 ** rDecimals;
        const circulating = supply != null ? supply - burned : null;
        if (circulating) backingPerToken = reserveBalance / circulating;
      }
    }

    out[p.token.address.toLowerCase()] = {
      supply,
      decimals,
      burned: supply == null ? null : burned,
      burnPct: supply ? (burned / supply) * 100 : null,
      circulating: supply == null ? null : supply - burned,
      reserveBalance,
      reserveSymbol: p.token.reserveSymbol || null,
      backingPerToken,
    };
  }
  return out;
}
