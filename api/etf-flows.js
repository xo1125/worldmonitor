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
  if (!apiKey) {
    console.warn('[ETF] No SOSOVALUE_API_KEY env var found');
    return null;
  }

  try {
    const res = await fetch('https://openapi.sosovalue.com/openapi/v2/etf/currentEtfDataMetrics', {
      method: 'POST',
      headers: {
        'x-soso-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'us-btc-spot' }),
    });

    if (!res.ok) {
      console.error(`[ETF] SoSoValue HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text().catch(() => '');
      console.error(`[ETF] SoSoValue response body: ${text.slice(0, 500)}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      console.error(`[ETF] SoSoValue API error: code=${json.code}, msg=${json.msg}`);
      return null;
    }

    const d = json.data;
    // Helper: SoSoValue returns values as strings inside {value, status} objects
    const num = (obj) => {
      if (obj == null) return null;
      if (typeof obj === 'number') return obj;
      if (typeof obj === 'object' && obj.value != null) return parseFloat(obj.value) || null;
      if (typeof obj === 'string') return parseFloat(obj) || null;
      return null;
    };

    const etfs = (d.list || []).map((item) => {
      const ticker = item.ticker || INSTITUTE_TO_TICKER[item.institute] || item.institute;
      const issuerMatch = ETF_TICKERS.find((t) => t.ticker === ticker);
      return {
        ticker,
        issuer: item.institute || issuerMatch?.issuer || '',
        dailyNetInflow: num(item.dailyNetInflow),
        flowStatus: item.dailyNetInflow?.dataStatus ?? item.dailyNetInflow?.status ?? 3,
        netAssets: num(item.netAssets),
        volume: num(item.dailyValueTraded),
        cumNetInflow: num(item.cumNetInflow),
        fee: num(item.fee),
        change: num(item.dailyPriceChange),
      };
    });

    const aggFlow = num(d.dailyNetInflow);
    // SoSoValue reports previous trading day's settled data
    // Compute the last US trading day (skip weekends + market holidays)
    const US_MARKET_HOLIDAYS_2026 = new Set([
      '2026-01-01', // New Year's Day
      '2026-01-19', // MLK Day
      '2026-02-16', // Presidents' Day
      '2026-04-03', // Good Friday
      '2026-05-25', // Memorial Day
      '2026-06-19', // Juneteenth
      '2026-07-03', // Independence Day (observed)
      '2026-09-07', // Labor Day
      '2026-11-26', // Thanksgiving
      '2026-12-25', // Christmas
    ]);
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    et.setDate(et.getDate() - 1); // Start from yesterday
    // Walk back until we hit a trading day (not weekend, not holiday)
    for (let i = 0; i < 10; i++) {
      const dow = et.getDay();
      const iso = et.toISOString().split('T')[0];
      if (dow !== 0 && dow !== 6 && !US_MARKET_HOLIDAYS_2026.has(iso)) break;
      et.setDate(et.getDate() - 1);
    }
    const dataDate = et.toISOString().split('T')[0];
    console.log(`[ETF] SoSoValue OK: ${etfs.length} ETFs, net flow: ${aggFlow}, dataDate: ${dataDate}`);

    return {
      source: 'sosovalue',
      etfs,
      aggregate: {
        dailyNetInflow: aggFlow ?? 0,
        totalVolume: num(d.dailyTotalValueTraded) ?? 0,
        totalNetAssets: num(d.totalNetAssets) ?? 0,
        cumNetInflow: num(d.cumNetInflow) ?? 0,
        etfCount: etfs.length,
      },
      dataDate,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[ETF] SoSoValue fetch exception:', err?.message || err);
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
          change: Math.round(change * 100) / 100,
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

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (cache.data && now - cache.ts < CACHE_TTL) {
      res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=300');
      res.setHeader('X-Cache', 'HIT');
      return res.json(cache.data);
    }

    // Try SoSoValue first (real data), fall back to Yahoo (estimated)
    let data = await fetchSoSoValue();
    if (!data) {
      data = await fetchYahooFallback();
    }

    cache = { data, ts: now };

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=300');
    res.setHeader('X-Cache', 'MISS');
    return res.json(data);
  } catch (error) {
    console.error('[ETF] Handler error:', error);
    return res.json({
      error: 'Failed to fetch ETF data',
      source: 'error',
      etfs: [],
      aggregate: { dailyNetInflow: 0, totalVolume: 0, totalNetAssets: 0, cumNetInflow: 0, etfCount: 0 },
      lastUpdated: new Date().toISOString(),
    });
  }
}
