export const config = { runtime: 'edge' };

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 120 * 1000; // 2 minutes

export default async function handler(req) {
  const url = new URL(req.url);
  const ids = url.searchParams.get('ids') || 'tether,usd-coin,dai';

  // Validate IDs
  const validIds = ids.split(',')
    .map(id => id.trim().toLowerCase())
    .filter(id => /^[a-z0-9-]+$/.test(id) && id.length <= 50)
    .slice(0, 20)
    .join(',');

  const cacheKey = validIds;

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
    const geckoUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${validIds}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=7d`;
    const response = await fetch(geckoUrl, {
      headers: { 'Accept': 'application/json' },
    });

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

    const data = await response.text();

    if (response.ok) {
      cache = { data, key: cacheKey, timestamp: Date.now() };
    }

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    if (cache.data && cache.key === cacheKey) {
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
