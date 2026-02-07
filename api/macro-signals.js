export const config = { runtime: 'edge' };

// Simple in-memory cache
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const TICKERS = ['JPY=X', 'BTC-USD', 'QQQ', 'XLP'];

// Mining cost model constants
const DAILY_BTC_MINED = 450; // post-halving: 3.125 BTC × 144 blocks
const AVG_EFFICIENCY_J_PER_TH = 25; // modern ASIC (S21-class)
const AVG_ELECTRICITY_USD_PER_KWH = 0.06; // global average electricity rate
const ALL_IN_MULTIPLIER = 1.5; // hardware amort, cooling, labor, facilities

async function fetchFearGreedIndex() {
  try {
    const url = 'https://api.alternative.me/fng/?limit=30';
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const entries = data.data;
    if (!entries || entries.length === 0) return null;

    const current = parseInt(entries[0].value, 10);
    const yesterday = entries.length > 1 ? parseInt(entries[1].value, 10) : current;
    const weekAgo = entries.length > 7 ? parseInt(entries[7].value, 10) : current;
    const sparkline = entries.slice(0, 30).map(e => parseInt(e.value, 10)).reverse();
    const classification = entries[0].value_classification;

    return { current, yesterday, weekAgo, sparkline, classification };
  } catch {
    return null;
  }
}

async function fetchBTCHashRate() {
  try {
    const url = 'https://mempool.space/api/v1/mining/hashrate/1m';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const hashrates = data.hashrates;
    if (!hashrates || hashrates.length === 0) return null;

    // Convert to EH/s series
    const ehSeries = hashrates.map(h => h.avgHashrate / 1e18);
    const current = ehSeries[ehSeries.length - 1];
    const thirtyDaysAgo = ehSeries.length > 30 ? ehSeries[ehSeries.length - 31] : ehSeries[0];
    const sevenDaysAgo = ehSeries.length > 7 ? ehSeries[ehSeries.length - 8] : ehSeries[0];

    const change30d = thirtyDaysAgo > 0 ? ((current - thirtyDaysAgo) / thirtyDaysAgo) * 100 : 0;
    const change7d = sevenDaysAgo > 0 ? ((current - sevenDaysAgo) / sevenDaysAgo) * 100 : 0;

    return {
      currentEH: current,
      change30d,
      change7d,
      sparkline: ehSeries.slice(-14),
    };
  } catch {
    return null;
  }
}

async function fetchYahooQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=250d&interval=1d`;
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

function computeSignals(quotes, hashRateData, fearGreedData) {
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
        'SMA200': `$${Math.round(calcSMA(btc.closes, 200)).toLocaleString()}`,
        'Mayer': calcSMA(btc.closes, 200) > 0 ? (price / calcSMA(btc.closes, 200)).toFixed(2) : 'N/A',
        'VWAP': `$${Math.round(vwap).toLocaleString()}`,
      },
    });
  }

  // Signal 5: Hash Rate
  if (hashRateData) {
    const { currentEH, change30d, change7d, sparkline: hrSparkline } = hashRateData;
    const isGrowing = change30d > 5;
    const isDeclining = change30d < -5;
    signals.push({
      name: 'Hash Rate',
      label: isGrowing ? 'GROWING' : isDeclining ? 'DECLINING' : 'STABLE',
      status: isGrowing ? 'bullish' : isDeclining ? 'bearish' : 'neutral',
      value: `${currentEH.toFixed(1)} EH/s`,
      detail: isGrowing ? `Network hashrate up ${change30d.toFixed(1)}% in 30d → miners confident`
        : isDeclining ? `Hashrate down ${Math.abs(change30d).toFixed(1)}% in 30d → miner capitulation risk`
        : `Hashrate stable (${change30d > 0 ? '+' : ''}${change30d.toFixed(1)}% 30d)`,
      sparkline: hrSparkline,
      supportingData: {
        'Current': `${currentEH.toFixed(1)} EH/s`,
        '30d': `${change30d > 0 ? '+' : ''}${change30d.toFixed(1)}%`,
        '7d': `${change7d > 0 ? '+' : ''}${change7d.toFixed(1)}%`,
      },
    });

    // Signal 6: Mining Cost
    if (btc) {
      const hashrateTH = currentEH * 1e6; // EH/s to TH/s
      const dailyEnergyCost = (hashrateTH * AVG_EFFICIENCY_J_PER_TH * 24) / 1000 * AVG_ELECTRICITY_USD_PER_KWH;
      const costPerBTC = (dailyEnergyCost / DAILY_BTC_MINED) * ALL_IN_MULTIPLIER;
      const btcPrice = btc.price;
      const margin = btcPrice > 0 ? ((btcPrice - costPerBTC) / btcPrice) * 100 : 0;
      const hashprice = (btcPrice * DAILY_BTC_MINED) / hashrateTH; // USD/TH/day

      const isProfitable = margin > 50;
      const isSqueeze = margin < 0;
      signals.push({
        name: 'Mining Cost',
        label: isProfitable ? 'PROFITABLE' : isSqueeze ? 'SQUEEZE' : 'TIGHT',
        status: isProfitable ? 'bullish' : isSqueeze ? 'bearish' : 'neutral',
        value: `Est. $${Math.round(costPerBTC).toLocaleString()}/BTC`,
        detail: isProfitable ? `Miners profitable (${margin.toFixed(0)}% margin)`
          : isSqueeze ? `Mining unprofitable → capitulation risk`
          : `Margins tightening (${margin.toFixed(0)}% margin)`,
        sparkline: hrSparkline,
        supportingData: {
          'Est. Cost': `$${Math.round(costPerBTC).toLocaleString()}`,
          'BTC Price': `$${btcPrice?.toLocaleString()}`,
          'Margin': `${margin.toFixed(0)}%`,
          'Hashprice': `$${hashprice.toFixed(2)}/TH/d`,
        },
      });
    }
  }

  // Signal 7: Fear & Greed Index
  if (fearGreedData) {
    const { current, yesterday, weekAgo, sparkline: fgSparkline } = fearGreedData;
    const weekChange = current - weekAgo;
    let label, status;
    if (current <= 25) { label = 'EXTREME FEAR'; status = 'bearish'; }
    else if (current <= 45) { label = 'FEAR'; status = 'bearish'; }
    else if (current <= 55) { label = 'NEUTRAL'; status = 'neutral'; }
    else if (current <= 75) { label = 'GREED'; status = 'bullish'; }
    else { label = 'EXTREME GREED'; status = 'bullish'; }

    signals.push({
      name: 'Fear & Greed',
      label,
      status,
      value: `${current} / 100`,
      detail: current <= 25 ? 'Extreme fear → potential buying opportunity'
        : current <= 45 ? 'Market fearful → caution warranted'
        : current <= 55 ? 'Sentiment balanced'
        : current <= 75 ? 'Greed rising → momentum but watch for reversal'
        : 'Extreme greed → elevated correction risk',
      sparkline: fgSparkline,
      supportingData: {
        'Today': `${current}`,
        'Yesterday': `${yesterday}`,
        '7d Change': `${weekChange > 0 ? '+' : ''}${weekChange}`,
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
    // Fetch all quotes + hashrate + fear/greed in parallel
    const [yahooResults, hashRateData, fearGreedData] = await Promise.all([
      Promise.all(TICKERS.map(fetchYahooQuote)),
      fetchBTCHashRate(),
      fetchFearGreedIndex(),
    ]);
    const quotes = {};
    TICKERS.forEach((ticker, i) => {
      if (yahooResults[i]) quotes[ticker] = yahooResults[i];
    });

    const signalResult = computeSignals(quotes, hashRateData, fearGreedData);
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
