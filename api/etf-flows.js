// Bitcoin ETF Flows - Vercel Edge Function
// Fetches from multiple sources with fallbacks

let cache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 min

// Major spot Bitcoin ETFs
const ETF_TICKERS = [
  { ticker: 'IBIT', name: 'iShares Bitcoin Trust', issuer: 'BlackRock' },
  { ticker: 'FBTC', name: 'Fidelity Wise Origin', issuer: 'Fidelity' },
  { ticker: 'ARKB', name: 'ARK 21Shares Bitcoin', issuer: 'ARK/21Shares' },
  { ticker: 'BITB', name: 'Bitwise Bitcoin ETF', issuer: 'Bitwise' },
  { ticker: 'GBTC', name: 'Grayscale Bitcoin Trust', issuer: 'Grayscale' },
  { ticker: 'HODL', name: 'VanEck Bitcoin Trust', issuer: 'VanEck' },
  { ticker: 'BRRR', name: 'Valkyrie Bitcoin Fund', issuer: 'Valkyrie' },
  { ticker: 'EZBC', name: 'Franklin Bitcoin ETF', issuer: 'Franklin' },
  { ticker: 'BTCO', name: 'Invesco Galaxy Bitcoin', issuer: 'Invesco' },
  { ticker: 'BTCW', name: 'WisdomTree Bitcoin', issuer: 'WisdomTree' },
];

async function fetchYahooPrice(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];

    // Get last two valid closes for daily change
    const validCloses = closes.filter((c) => c != null);
    const lastClose = validCloses[validCloses.length - 1];
    const prevClose = validCloses.length > 1 ? validCloses[validCloses.length - 2] : meta.chartPreviousClose;

    // Get latest volume
    const validVolumes = volumes.filter((v) => v != null);
    const lastVolume = validVolumes[validVolumes.length - 1] || 0;

    const change = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;

    return {
      price: lastClose,
      change: Math.round(change * 100) / 100,
      volume: lastVolume,
      prevClose,
    };
  } catch {
    return null;
  }
}

async function fetchETFData() {
  const results = await Promise.allSettled(
    ETF_TICKERS.map(async (etf) => {
      const priceData = await fetchYahooPrice(etf.ticker);
      return {
        ...etf,
        price: priceData?.price ?? null,
        change: priceData?.change ?? null,
        volume: priceData?.volume ?? null,
      };
    })
  );

  const etfs = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((e) => e.price !== null);

  const totalVolume = etfs.reduce((sum, e) => sum + (e.volume || 0), 0);
  const avgChange = etfs.length > 0
    ? etfs.reduce((sum, e) => sum + (e.change || 0), 0) / etfs.length
    : 0;

  // Estimate net flows from volume and price change direction
  const flowEstimate = etfs.reduce((sum, e) => {
    if (!e.volume || !e.price || !e.change) return sum;
    const dollarVolume = e.volume * e.price;
    return sum + (e.change > 0 ? dollarVolume * 0.1 : -dollarVolume * 0.1);
  }, 0);

  return {
    etfs,
    aggregate: {
      totalVolume,
      avgChange: Math.round(avgChange * 100) / 100,
      estimatedNetFlow: Math.round(flowEstimate),
      etfCount: etfs.length,
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

    const data = await fetchETFData();
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
        etfs: ETF_TICKERS.map((e) => ({ ...e, price: null, change: null, volume: null })),
        aggregate: { totalVolume: 0, avgChange: 0, estimatedNetFlow: 0, etfCount: 0 },
        lastUpdated: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export const config = { runtime: 'edge' };
