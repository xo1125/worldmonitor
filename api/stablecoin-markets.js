export const config = { runtime: 'edge' };

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 120 * 1000; // 2 minutes
const STALE_TTL = 300 * 1000; // 5 minutes stale-while-revalidate

// Default stablecoins to track
const DEFAULT_IDS = 'tether,usd-coin,dai,first-digital-usd,ethena-usde';

// Depeg detection thresholds (koala73-style)
const PEG_THRESHOLDS = {
  ON_PEG: 0.005,       // ≤0.5% deviation
  SLIGHT_DEPEG: 0.01,  // 0.5-1% deviation
  // >1% = DEPEGGED
};

function computePegStatus(price) {
  const deviation = Math.abs(price - 1.0);
  if (deviation <= PEG_THRESHOLDS.ON_PEG) return 'ON_PEG';
  if (deviation <= PEG_THRESHOLDS.SLIGHT_DEPEG) return 'SLIGHT_DEPEG';
  return 'DEPEGGED';
}

function computeHealthStatus(coins) {
  const depeggedCount = coins.filter(c => c.pegStatus === 'DEPEGGED').length;
  const slightDepegCount = coins.filter(c => c.pegStatus === 'SLIGHT_DEPEG').length;

  if (depeggedCount > 0) return 'WARNING';
  if (slightDepegCount >= 2) return 'CAUTION';
  return 'HEALTHY';
}

export default async function handler(req) {
  const url = new URL(req.url);
  const ids = url.searchParams.get('ids') || DEFAULT_IDS;

  // Validate IDs
  const validIds = ids.split(',')
    .map(id => id.trim().toLowerCase())
    .filter(id => /^[a-z0-9-]+$/.test(id) && id.length <= 50)
    .slice(0, 20)
    .join(',');

  const cacheKey = validIds;

  // Serve from cache if fresh
  if (cache.data && cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_TTL) {
    return new Response(cache.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const geckoUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${validIds}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=7d`;
    const response = await fetch(geckoUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FCMonitor/1.0',
      },
    });

    // Rate limited — serve stale cache
    if (response.status === 429 && cache.data && cache.key === cacheKey) {
      return new Response(cache.data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'STALE',
        },
      });
    }

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }

    const rawCoins = await response.json();

    // Enrich with depeg detection
    const coins = rawCoins.map(coin => {
      const pegDeviation = Math.abs((coin.current_price ?? 1.0) - 1.0);
      const pegStatus = computePegStatus(coin.current_price ?? 1.0);
      return {
        ...coin,
        pegDeviation,
        pegStatus,
      };
    });

    // Compute aggregate summary
    const totalMarketCap = coins.reduce((sum, c) => sum + (c.market_cap || 0), 0);
    const totalVolume24h = coins.reduce((sum, c) => sum + (c.total_volume || 0), 0);
    const depeggedCount = coins.filter(c => c.pegStatus !== 'ON_PEG').length;
    const healthStatus = computeHealthStatus(coins);

    const result = {
      coins,
      summary: {
        totalMarketCap,
        totalVolume24h,
        depeggedCount,
        healthStatus,
        coinCount: coins.length,
      },
    };

    const resultJson = JSON.stringify(result);

    // Update cache
    cache = { data: resultJson, key: cacheKey, timestamp: Date.now() };

    return new Response(resultJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    // Serve stale cache on error (up to STALE_TTL)
    if (cache.data && cache.key === cacheKey && Date.now() - cache.timestamp < STALE_TTL) {
      return new Response(cache.data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'ERROR-FALLBACK',
        },
      });
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch stablecoin markets' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
