export const config = { runtime: 'edge' };

// Simple in-memory cache
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const TICKERS = ['JPY=X', 'BTC-USD', 'QQQ', 'XLP'];

async function fetchYahooQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=60d&interval=1d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const timestamps = result.timestamp || [];
    const meta = result.meta;

    return {
      symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose || meta.previousClose,
      closes: closes.filter(c => c !== null),
      volumes: volumes.filter(v => v !== null),
      timestamps,
    };
  } catch {
    return null;
  }
}

function calcROC(closes, period) {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (!past || past === 0) return 0;
  return ((current - past) / past) * 100;
}

function calcSMA(closes, period) {
  if (closes.length < period) return closes[closes.length - 1] || 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calcVWAP(closes, volumes) {
  // Simple VWAP from start of available data (YTD proxy)
  if (closes.length === 0 || volumes.length === 0) return closes[closes.length - 1] || 0;
  let sumPV = 0;
  let sumV = 0;
  const len = Math.min(closes.length, volumes.length);
  for (let i = 0; i < len; i++) {
    if (closes[i] && volumes[i]) {
      sumPV += closes[i] * volumes[i];
      sumV += volumes[i];
    }
  }
  return sumV > 0 ? sumPV / sumV : closes[closes.length - 1];
}

function computeSignals(quotes) {
  const jpy = quotes['JPY=X'];
  const btc = quotes['BTC-USD'];
  const qqq = quotes['QQQ'];
  const xlp = quotes['XLP'];

  const signals = [];

  // Signal 1: Liquidity Condition (JPY ROC)
  if (jpy) {
    const jpyROC = calcROC(jpy.closes, 30);
    const isSqueezing = jpyROC > 2; // Yen strengthening fast
    signals.push({
      name: 'Liquidity',
      label: isSqueezing ? 'SQUEEZE' : 'NORMAL',
      status: isSqueezing ? 'bearish' : 'bullish',
      value: `JPY 30d ROC: ${jpyROC.toFixed(2)}%`,
      detail: isSqueezing ? 'Yen strengthening → carry trade unwind risk' : 'Yen stable → no liquidity headwind',
      sparkline: jpy.closes.slice(-14),
      supportingData: {
        'JPY/USD': `${jpy.price?.toFixed(2)}`,
        '30d ROC': `${jpyROC.toFixed(2)}%`,
        '7d ROC': `${calcROC(jpy.closes, 7).toFixed(2)}%`,
      },
    });
  }

  // Signal 2: Flow Structure (BTC vs QQQ)
  if (btc && qqq) {
    const btcReturn = calcROC(btc.closes, 5);
    const qqqReturn = calcROC(qqq.closes, 5);
    const isGap = qqqReturn > 0 && btcReturn < -5;
    signals.push({
      name: 'Flow Structure',
      label: isGap ? 'PASSIVE GAP' : 'ALIGNED',
      status: isGap ? 'bearish' : 'bullish',
      value: `BTC 1w: ${btcReturn.toFixed(1)}% | QQQ 1w: ${qqqReturn.toFixed(1)}%`,
      detail: isGap ? 'Stocks holding, BTC flushing → risk of further downside' : 'BTC & stocks moving together',
      sparkline: btc.closes.slice(-14),
      supportingData: {
        'BTC 1w': `${btcReturn.toFixed(1)}%`,
        'QQQ 1w': `${qqqReturn.toFixed(1)}%`,
        'Spread': `${(btcReturn - qqqReturn).toFixed(1)}%`,
      },
    });
  }

  // Signal 3: Macro Regime (QQQ/XLP ratio)
  if (qqq && xlp) {
    const ratios = [];
    const len = Math.min(qqq.closes.length, xlp.closes.length);
    for (let i = 0; i < len; i++) {
      if (qqq.closes[i] && xlp.closes[i] && xlp.closes[i] > 0) {
        ratios.push(qqq.closes[i] / xlp.closes[i]);
      }
    }
    const ratioROC = ratios.length > 20
      ? ((ratios[ratios.length - 1] - ratios[ratios.length - 21]) / ratios[ratios.length - 21]) * 100
      : 0;
    const isRiskOn = ratioROC > 0;
    signals.push({
      name: 'Macro Regime',
      label: isRiskOn ? 'RISK-ON' : 'DEFENSIVE',
      status: isRiskOn ? 'bullish' : 'bearish',
      value: `QQQ/XLP 20d ROC: ${ratioROC.toFixed(2)}%`,
      detail: isRiskOn ? 'Growth outperforming defensives' : 'Defensives outperforming growth',
      sparkline: ratios.slice(-14),
      supportingData: {
        'QQQ': `$${qqq.price?.toFixed(2)}`,
        'XLP': `$${xlp.price?.toFixed(2)}`,
        'Ratio': `${(ratios[ratios.length - 1] || 0).toFixed(2)}`,
        '20d ROC': `${ratioROC.toFixed(2)}%`,
      },
    });
  }

  // Signal 4: Technical Trend (BTC vs 50 SMA + VWAP)
  if (btc) {
    const price = btc.price;
    const sma50 = calcSMA(btc.closes, 50);
    const vwap = calcVWAP(btc.closes, btc.volumes);
    const isBullish = price > sma50 && price > vwap;
    const isBearish = price < sma50;
    signals.push({
      name: 'Technical Trend',
      label: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
      status: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral',
      value: `BTC: $${price?.toLocaleString()} | SMA50: $${Math.round(sma50).toLocaleString()}`,
      detail: isBullish ? 'Price above 50 SMA & VWAP' : isBearish ? 'Price below 50 SMA' : 'Mixed signals',
      sparkline: btc.closes.slice(-14),
      supportingData: {
        'BTC': `$${price?.toLocaleString()}`,
        'SMA50': `$${Math.round(sma50).toLocaleString()}`,
        'VWAP': `$${Math.round(vwap).toLocaleString()}`,
      },
    });
  }

  // Overall verdict
  const allBullish = signals.every(s => s.status === 'bullish');
  const verdict = allBullish ? 'BUY' : 'CASH';

  return { verdict, signals, lastUpdated: new Date().toISOString() };
}

export default async function handler(req) {
  // Return cached data if fresh
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
    // Fetch all quotes in parallel
    const results = await Promise.all(TICKERS.map(fetchYahooQuote));
    const quotes = {};
    TICKERS.forEach((ticker, i) => {
      if (results[i]) quotes[ticker] = results[i];
    });

    const signalResult = computeSignals(quotes);
    const responseBody = JSON.stringify(signalResult);

    // Cache the result
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
    // Return cached on error
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
    return new Response(JSON.stringify({ error: 'Failed to compute signals' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
