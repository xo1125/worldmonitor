export const config = { runtime: 'edge' };

// In-memory cache
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fallback constants — update manually if on-chain APIs are unavailable
const STH_RP_FALLBACK = 92000;
const REALIZED_PRICE_FALLBACK = 55800;
const TRUE_MEAN_FALLBACK = 80200;

async function fetchBTCPrice() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=60d&interval=1d';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c !== null);
    const price = result.meta?.regularMarketPrice;

    return { price, closes };
  } catch {
    return null;
  }
}

async function fetch200WMA() {
  try {
    // Fetch ~5 years of daily data from CoinGecko (free tier)
    const url = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1400&interval=daily';
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const prices = data.prices; // [[timestamp, price], ...]
    if (!prices || prices.length < 200) return null;

    // Group into weekly closes (Sunday end)
    const weeklyCloses = [];
    let currentWeek = null;
    let lastPrice = 0;

    for (const [ts, price] of prices) {
      const date = new Date(ts);
      const weekKey = getWeekKey(date);

      if (currentWeek !== weekKey) {
        if (currentWeek !== null) {
          weeklyCloses.push(lastPrice);
        }
        currentWeek = weekKey;
      }
      lastPrice = price;
    }
    weeklyCloses.push(lastPrice); // Push final week

    if (weeklyCloses.length < 200) return null;

    // Compute 200-week moving average
    const last200 = weeklyCloses.slice(-200);
    const wma200 = last200.reduce((a, b) => a + b, 0) / 200;

    return Math.round(wma200);
  } catch {
    return null;
  }
}

function getWeekKey(date) {
  const year = date.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((date - jan1) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

async function fetchCryptoQuantSTH() {
  try {
    // CryptoQuant free tier — may require API key
    const apiKey = process.env.CRYPTOQUANT_API_KEY;
    if (!apiKey) return null;

    const url = 'https://api.cryptoquant.com/v1/bitcoin/market-data/realized-price?window=short_term';
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.result?.data?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function fetchCryptoQuantRealized() {
  try {
    const apiKey = process.env.CRYPTOQUANT_API_KEY;
    if (!apiKey) return null;

    const url = 'https://api.cryptoquant.com/v1/bitcoin/market-data/realized-price';
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.result?.data?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

function computeRegime(price, levels) {
  const { sth_rp, true_mean, wma_200 } = levels;

  // Floor test takes priority — within 5% of 200WMA
  if (price <= wma_200.value * 1.05) return 'FLOOR_TEST';
  if (price > sth_rp.value) return 'BULL';
  if (price >= true_mean.value) return 'DEFENSIVE';
  return 'BEAR';
}

function computeRiskScore(price, wma200, sthRp) {
  // 0 = safe (at STH-RP), 100 = at the floor (200WMA)
  const range = sthRp - wma200;
  if (range <= 0) return 50;
  const score = 100 - ((price - wma200) / range) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export default async function handler(req) {
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return new Response(cache.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=120',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const [btcData, wma200Raw, sthRpRaw, realizedRaw] = await Promise.all([
      fetchBTCPrice(),
      fetch200WMA(),
      fetchCryptoQuantSTH(),
      fetchCryptoQuantRealized(),
    ]);

    if (!btcData) {
      throw new Error('Failed to fetch BTC price');
    }

    const price = btcData.price;
    const wma200 = wma200Raw ?? 58011; // Fallback if CoinGecko fails
    const sthRp = sthRpRaw ?? STH_RP_FALLBACK;
    const realized = realizedRaw ?? REALIZED_PRICE_FALLBACK;
    const trueMean = sthRpRaw && realizedRaw
      ? Math.round((realized + wma200) / 2)
      : TRUE_MEAN_FALLBACK;

    const levels = {
      sth_rp: {
        value: sthRp,
        source: sthRpRaw ? 'api' : 'fallback',
        label: 'STH Cost Basis',
        tag: 'The Trap',
      },
      true_mean: {
        value: trueMean,
        source: sthRpRaw && realizedRaw ? 'derived' : 'fallback',
        label: 'True Market Mean',
        tag: 'The Pivot',
      },
      wma_200: {
        value: wma200,
        source: wma200Raw ? 'computed' : 'fallback',
        label: '200-Week MA',
        tag: 'The Floor',
      },
      realized: {
        value: realized,
        source: realizedRaw ? 'api' : 'fallback',
        label: 'Realized Price',
        tag: 'Deep Value',
      },
    };

    const regime = computeRegime(price, levels);
    const riskScore = computeRiskScore(price, wma200, sthRp);
    const retestProximity = Math.min(1, price / sthRp);
    const deadCatWarning = price > 90000 && price < sthRp;

    const result = {
      price,
      levels,
      regime,
      risk_score: riskScore,
      retest_proximity: parseFloat(retestProximity.toFixed(3)),
      dead_cat_warning: deadCatWarning,
      price_history_30d: btcData.closes.slice(-30),
      lastUpdated: new Date().toISOString(),
    };

    const responseBody = JSON.stringify(result);
    cache = { data: responseBody, timestamp: Date.now() };

    return new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=120',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    if (cache.data) {
      return new Response(cache.data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'ERROR-FALLBACK',
        },
      });
    }
    return new Response(JSON.stringify({ error: 'Failed to compute BTC levels' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
