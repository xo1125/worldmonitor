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
      sparkline: ehSeries.slice(-30),
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

/**
 * Calculate RSI (Relative Strength Index) for a given period.
 * Returns the current RSI value (0-100).
 * Uses Wilder's smoothing method (exponential moving average of gains/losses).
 */
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50; // default neutral if insufficient data

  // Calculate price changes
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss over first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining changes
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate rolling RSI values over a window of days — O(n) single-pass.
 * Uses Wilder's smoothing incrementally instead of recomputing from scratch.
 */
function calcRollingRSI(closes, period = 14, window = 30) {
  if (closes.length < period + 1) return [50];

  // Compute all price changes once
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Seed: initial average gain/loss over first `period` changes
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Walk forward, recording RSI at each step
  const allRSI = [];
  const toRSI = (ag, al) => al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  allRSI.push(toRSI(avgGain, avgLoss));

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    allRSI.push(toRSI(avgGain, avgLoss));
  }

  // Return last `window` values
  return allRSI.slice(-window);
}

// Known stablecoin IDs in CoinGecko's market_cap_percentage
// Stablecoins to exclude from alt mcap (USD-pegged only)
const STABLECOIN_IDS = new Set(['usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'usdd', 'fdusd', 'pyusd', 'gusd', 'frax', 'lusd', 'susd', 'usde', 'eurs']);

async function fetchAltSeasonData() {
  try {
    // Get market data from CoinGecko global
    const res = await fetch('https://api.coingecko.com/api/v3/global');
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.data;
    const btcDom = d.market_cap_percentage?.btc || 0;
    const ethDom = d.market_cap_percentage?.eth || 0;
    const totalMcap = d.total_market_cap?.usd || 0;
    const mcapChange24h = d.market_cap_change_percentage_24h_usd || 0;

    // Sum stablecoin + LST dominance to exclude them
    let stableDom = 0;
    for (const [key, val] of Object.entries(d.market_cap_percentage || {})) {
      if (STABLECOIN_IDS.has(key)) stableDom += val;
    }

    // Crypto ex BTC, ETH, Stables = total - BTC - ETH - stables
    const exDom = 100 - btcDom - ethDom - stableDom;
    const altMcap = totalMcap * Math.max(exDom, 0) / 100;
    return { btcDom, ethDom, stableDom, totalMcap, altMcap, mcapChange24h };
  } catch {
    return null;
  }
}

function computeSignals(quotes, hashRateData, fearGreedData, altSeasonData) {
  const jpy = quotes['JPY=X'];
  const btc = quotes['BTC-USD'];
  const qqq = quotes['QQQ'];
  const xlp = quotes['XLP'];

  const signals = [];

  // Signal 1: Liquidity Condition (JPY ROC)
  // JPY=X is USD/JPY: rising = yen weakening (normal), falling = yen strengthening (squeeze)
  if (jpy) {
    const jpyROC = calcROC(jpy.closes, 30);
    const isSqueezing = jpyROC < -3; // Yen strengthening (USD/JPY falling)
    signals.push({
      name: 'Liquidity',
      label: isSqueezing ? 'SQUEEZE' : 'NORMAL',
      status: isSqueezing ? 'bearish' : 'bullish',
      value: `JPY 30d ROC: ${jpyROC > 0 ? '+' : ''}${jpyROC.toFixed(2)}%`,
      detail: isSqueezing ? 'Yen strengthening → carry trade unwind risk' : 'Yen stable → no liquidity headwind',
      sparkline: jpy.closes.slice(-30),
      supportingData: {
        'USD/JPY': `${jpy.price?.toFixed(2)}`,
        '30d ROC': `${jpyROC > 0 ? '+' : ''}${jpyROC.toFixed(2)}%`,
        '7d ROC': `${calcROC(jpy.closes, 7) > 0 ? '+' : ''}${calcROC(jpy.closes, 7).toFixed(2)}%`,
      },
    });
  }

  // Signal 2: Flow Structure (BTC vs QQQ)
  // Detects divergence in either direction — large spread means decoupling
  if (btc && qqq) {
    const btcReturn = calcROC(btc.closes, 5);
    const qqqReturn = calcROC(qqq.closes, 5);
    const spread = Math.abs(btcReturn - qqqReturn);
    const isGap = spread > 8; // >8% divergence in either direction
    const btcLeading = btcReturn > qqqReturn;

    let detail;
    if (!isGap) {
      detail = 'BTC & stocks moving together';
    } else if (btcLeading) {
      detail = 'BTC decoupling up from equities → watch for mean reversion';
    } else {
      detail = 'Stocks holding, BTC flushing → risk of further downside';
    }

    signals.push({
      name: 'Flow Structure',
      label: isGap ? 'PASSIVE GAP' : 'ALIGNED',
      status: isGap ? 'neutral' : 'bullish',
      value: `BTC 1w: ${btcReturn >= 0 ? '+' : ''}${btcReturn.toFixed(1)}% | QQQ 1w: ${qqqReturn >= 0 ? '+' : ''}${qqqReturn.toFixed(1)}%`,
      detail,
      sparkline: btc.closes.slice(-30),
      supportingData: {
        'BTC 1w': `${btcReturn >= 0 ? '+' : ''}${btcReturn.toFixed(1)}%`,
        'QQQ 1w': `${qqqReturn >= 0 ? '+' : ''}${qqqReturn.toFixed(1)}%`,
        'Spread': `${spread.toFixed(1)}%`,
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
      sparkline: ratios.slice(-30),
      supportingData: {
        'QQQ': `$${qqq.price?.toFixed(2)}`,
        'XLP': `$${xlp.price?.toFixed(2)}`,
        'Ratio': `${(ratios[ratios.length - 1] || 0).toFixed(2)}`,
        '20d ROC': `${ratioROC.toFixed(2)}%`,
      },
    });
  }

  // Signal 4: Momentum (RSI + Mayer Multiple)
  if (btc) {
    const price = btc.price;
    const rsi = calcRSI(btc.closes, 14);
    const sma200 = calcSMA(btc.closes, 200);
    const mayerMultiple = sma200 > 0 ? price / sma200 : 1;
    const priceChange30d = calcROC(btc.closes, 30);
    const rsiSparkline = calcRollingRSI(btc.closes, 14, 30);

    const isOverbought = rsi > 70;
    const isOversold = rsi < 30;
    const mayerWeak = mayerMultiple < 0.85; // Price well below SMA200
    const mayerStrong = mayerMultiple > 1.4; // Price well above SMA200

    // Combined RSI + Mayer logic
    let label, status, detail;
    if (isOverbought || mayerStrong) {
      label = 'OVERBOUGHT';
      status = 'bearish';
      detail = `RSI ${rsi.toFixed(0)} / Mayer ${mayerMultiple.toFixed(2)} → momentum overextended`;
    } else if (isOversold) {
      label = 'OVERSOLD';
      status = 'bullish';
      detail = `RSI ${rsi.toFixed(0)} oversold → contrarian buy signal. Mayer ${mayerMultiple.toFixed(2)}`;
    } else if (mayerWeak) {
      label = 'WEAK';
      status = 'bearish';
      detail = `Price ${((1 - mayerMultiple) * 100).toFixed(0)}% below SMA200 → weak trend. RSI ${rsi.toFixed(0)}`;
    } else if (rsi >= 55 && mayerMultiple >= 1.0) {
      label = 'STRONG';
      status = 'bullish';
      detail = `RSI ${rsi.toFixed(0)} bullish, above SMA200. Mayer ${mayerMultiple.toFixed(2)}`;
    } else {
      label = 'NEUTRAL';
      status = 'neutral';
      detail = `RSI ${rsi.toFixed(0)} / Mayer ${mayerMultiple.toFixed(2)} → no clear trend`;
    }

    signals.push({
      name: 'Momentum',
      label,
      status,
      value: `RSI: ${rsi.toFixed(1)} | Mayer: ${mayerMultiple.toFixed(2)}`,
      detail,
      sparkline: rsiSparkline,
      supportingData: {
        'RSI(14)': rsi.toFixed(1),
        'Mayer': mayerMultiple.toFixed(2),
        'SMA200': `$${Math.round(sma200).toLocaleString()}`,
        '30d Chg': `${priceChange30d >= 0 ? '+' : ''}${priceChange30d.toFixed(1)}%`,
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

  // Signal 8: Crypto ex BTC/ETH/Stables market cap
  if (altSeasonData) {
    const { altMcap, mcapChange24h, totalMcap } = altSeasonData;
    const altMcapB = altMcap / 1e9;
    const totalMcapT = totalMcap / 1e12;
    const altPct = totalMcap > 0 ? (altMcap / totalMcap * 100) : 0;

    // Classify based on alt share of total market
    const isStrong = altPct > 30;
    const isWeak = altPct < 20;

    const fmtB = (v) => v >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${v.toFixed(0)}B`;

    signals.push({
      name: 'Crypto (Alts)',
      label: isStrong ? 'ALTS STRONG' : isWeak ? 'ALTS WEAK' : 'MIXED',
      status: isStrong ? 'bullish' : isWeak ? 'bearish' : 'neutral',
      value: fmtB(altMcapB),
      detail: isStrong ? 'Alt share above 30% → capital rotating into alts'
        : isWeak ? 'Alt share below 20% → capital concentrated in BTC/ETH'
        : 'Alt share between 20-30% → mixed market rotation',
      sparkline: btc ? btc.closes.slice(-30) : [],
      supportingData: {
        'Alt MCap': fmtB(altMcapB),
        'Share': `${altPct.toFixed(1)}%`,
        'Total': `$${totalMcapT.toFixed(2)}T`,
        'MCap 24h': `${mcapChange24h >= 0 ? '+' : ''}${mcapChange24h.toFixed(1)}%`,
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
    const [yahooResults, hashRateData, fearGreedData, altSeasonData] = await Promise.all([
      Promise.all(TICKERS.map(fetchYahooQuote)),
      fetchBTCHashRate(),
      fetchFearGreedIndex(),
      fetchAltSeasonData(),
    ]);
    const quotes = {};
    TICKERS.forEach((ticker, i) => {
      if (yahooResults[i]) quotes[ticker] = yahooResults[i];
    });

    const signalResult = computeSignals(quotes, hashRateData, fearGreedData, altSeasonData);
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
