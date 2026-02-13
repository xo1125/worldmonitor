export const config = { runtime: 'edge' };

const COIN_ID_PATTERN = /^[a-z0-9-]+$/;
const MAX_COIN_IDS = 50;

// Simple in-memory cache for edge function (reset on cold start)
let cache = { data: null, timestamp: 0, key: '' };
const CACHE_TTL = 120 * 1000; // 2 minutes
const STALE_TTL = 300 * 1000; // 5 minutes stale-while-revalidate

export default async function handler(req) {
  const url = new URL(req.url);
  const ids = url.searchParams.get('ids') || '';

  // Validate and sanitize IDs
  const validIds = ids.split(',')
    .map(id => id.trim().toLowerCase())
    .filter(id => COIN_ID_PATTERN.test(id) && id.length <= 50)
    .slice(0, MAX_COIN_IDS)
    .join(',');

  if (!validIds) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const cacheKey = validIds;

  // Serve from cache if fresh
  if (cache.data && cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_TTL) {
    return new Response(cache.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const geckoUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${validIds}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=7d`;
    const response = await fetch(geckoUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/1.0',
      },
    });

    // Rate limited — serve stale cache
    if (response.status === 429 && cache.data && cache.key === cacheKey) {
      return new Response(cache.data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
          'X-Cache': 'STALE',
        },
      });
    }

    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }

    const data = await response.text();

    // Cache successful response
    cache = { data, key: cacheKey, timestamp: Date.now() };

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
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
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
          'X-Cache': 'ERROR-FALLBACK',
        },
      });
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch portfolio market data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
