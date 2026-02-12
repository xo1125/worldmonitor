// Bitcoin ETF Flows - Vercel Edge Function
// Primary: SoSoValue API (real flow data)
// Fallback: Yahoo Finance (volume-based estimates)

let cache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 min

const ETF_TICKERS = [
  { ticker: 'IBIT', issuer: 'BlackRock' },
  { ticker: 'FBTC', issuer: 'Fidelity' },
  { ticker: 'ARKB', issuer: 'ARK/21Shares' },
  { ticker: 'BITB', issuer: 'Bitwise' },
  { ticker: 'GBTC', issuer: 'Grayscale' },
  { ticker: 'HODL', issuer: 'VanEck' },
  { ticker: 'BRRR', issuer: 'Valkyrie' },
  { ticker: 'EZBC', issuer: 'Franklin' },
  { ticker: 'BTCO', issuer: 'Invesco' },
  { ticker: 'BTCW', issuer: 'WisdomTree' },
];

// Map SoSoValue institute names to our ticker list
const INSTITUTE_TO_TICKER = {
  'BlackRock': 'IBIT',
  'Fidelity': 'FBTC',
  'ARK 21Shares': 'ARKB',
  'Ark/21Shares': 'ARKB',
  'Bitwise': 'BITB',
  'Grayscale': 'GBTC',
  'VanEck': 'HODL',
  'Valkyrie': 'BRRR',
  'Franklin': 'EZBC',
  'Franklin Templeton': 'EZBC',
  'Invesco': 'BTCO',
  'Invesco Galaxy': 'BTCO',
  'WisdomTree': 'BTCW',
};

async function fetchSoSoValue() {
  const apiKey = process.env.SOSOVALUE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.sosovalue.xyz/openapi/v2/etf/currentEtfDataMetrics', {
      method: 'POST',
      headers: {
        'x-soso-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'us-btc-spot' }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 0 || !json.data) return null;

    const d = json.data;
    const etfs = (d.list || []).map((item) => {
      const ticker = item.ticker || INSTITUTE_TO_TICKER[item.institute] || item.institute;
      const issuerMatch = ETF_TICKERS.find((t) => t.ticker === ticker);
      return {
        ticker,
        issuer: item.institute || issuerMatch?.issuer || '',
        dailyNetInflow: item.dailyNetInflow?.value ?? null,
        flowStatus: item.dailyNetInflow?.dataStatus ?? 3,
        netAssets: item.netAssets?.value ?? null,
        volume: item.dailyValueTraded?.value ?? null,
        cumNetInflow: item.cumNetInflow?.value ?? null,
        fee: item.fee ?? null,
      };
    });

    return {
      source: 'sosovalue',
      etfs,
      aggregate: {
        dailyNetInflow: d.dailyNetInflow ?? 0,
        totalVolume: d.dailyTotalValueTraded ?? 0,
        totalNetAssets: d.totalNetAssets ?? 0,
        cumNetInflow: d.cumNetInflow ?? 0,
        etfCount: etfs.length,
      },
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchYahooFallback() {
  const results = await Promise.allSettled(
    ETF_TICKERS.map(async (etf) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${etf.ticker}?range=5d&interval=1d`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return { ...etf, dailyNetInflow: null, volume: null, netAssets: null };
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return { ...etf, dailyNetInflow: null, volume: null, netAssets: null };

        const closes = result.indicators?.quote?.[0]?.close || [];
        const volumes = result.indicators?.quote?.[0]?.volume || [];
        const validCloses = closes.filter((c) => c != null);
        const lastClose = validCloses[validCloses.length - 1];
        const prevClose = validCloses.length > 1 ? validCloses[validCloses.length - 2] : result.meta.chartPreviousClose;
        const validVolumes = volumes.filter((v) => v != null);
        const lastVolume = validVolumes[validVolumes.length - 1] || 0;
        const change = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;
        const dollarVol = lastVolume * (lastClose || 0);
        const direction = change >= 0 ? 1 : -1;
        const weight = Math.min(Math.abs(change) / 100, 0.5);
        const estFlow = dollarVol * Math.max(weight, 0.02) * direction;

        return {
          ...etf,
          dailyNetInflow: Math.round(estFlow),
          flowStatus: 0, // estimated
          volume: Math.round(dollarVol),
          netAssets: null,
        };
      } catch {
        return { ...etf, dailyNetInflow: null, volume: null, netAssets: null };
      }
    })
  );

  const etfs = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const validEtfs = etfs.filter((e) => e.dailyNetInflow !== null);
  const totalFlow = validEtfs.reduce((s, e) => s + (e.dailyNetInflow || 0), 0);
  const totalVol = validEtfs.reduce((s, e) => s + (e.volume || 0), 0);

  return {
    source: 'yahoo-estimated',
    etfs,
    aggregate: {
      dailyNetInflow: totalFlow,
      totalVolume: totalVol,
      totalNetAssets: 0,
      cumNetInflow: 0,
      etfCount: validEtfs.length,
    },
    lastUpdated: new Date().toISOString(),
  };
}

export default async function handler(req) {
  try {
    const now = Date.now();
    if (cache.data && now - cache.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cache.data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      });
    }

    // Try SoSoValue first (real data), fall back to Yahoo (estimated)
    let data = await fetchSoSoValue();
    if (!data) {
      data = await fetchYahooFallback();
    }

    cache = { data, ts: now };

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch ETF data',
        source: 'error',
        etfs: [],
        aggregate: { dailyNetInflow: 0, totalVolume: 0, totalNetAssets: 0, cumNetInflow: 0, etfCount: 0 },
        lastUpdated: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const config = { runtime: 'edge' };
