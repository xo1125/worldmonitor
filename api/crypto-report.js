export const config = { runtime: 'edge' };

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export default async function handler(req) {
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return new Response(cache.data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    // Fetch top 100 coins with 7d change from CoinGecko
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=7d';
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko responded with ${response.status}`);
    }

    const coins = await response.json();

    // Compute gainers/losers by 7d % change
    const withPctChange = coins
      .filter(c => c.price_change_percentage_7d_in_currency != null)
      .map(c => ({
        symbol: c.symbol?.toUpperCase(),
        name: c.name,
        price: c.current_price,
        marketCap: c.market_cap,
        change7dPct: c.price_change_percentage_7d_in_currency,
        change7dUsd: (c.current_price * c.price_change_percentage_7d_in_currency / 100),
      }));

    // Sort by % change
    const byPct = [...withPctChange].sort((a, b) => b.change7dPct - a.change7dPct);
    const topPctGainers = byPct.slice(0, 3);
    const topPctLosers = byPct.slice(-3).reverse();

    // Sort by $ change
    const byUsd = [...withPctChange].sort((a, b) => b.change7dUsd - a.change7dUsd);
    const topUsdGainers = byUsd.slice(0, 3);
    const topUsdLosers = byUsd.slice(-3).reverse();

    // Market cap distribution
    const mcapTiers = { mega: 0, large: 0, mid: 0, small: 0 };
    for (const c of withPctChange) {
      if (c.marketCap >= 10e9) mcapTiers.mega++;
      else if (c.marketCap >= 1e9) mcapTiers.large++;
      else if (c.marketCap >= 100e6) mcapTiers.mid++;
      else mcapTiers.small++;
    }

    const result = {
      topPctGainers,
      topPctLosers,
      topUsdGainers,
      topUsdLosers,
      mcapTiers,
      totalCoins: withPctChange.length,
      lastUpdated: new Date().toISOString(),
    };

    const body = JSON.stringify(result);
    cache = { data: body, timestamp: Date.now() };

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    if (cache.data) {
      return new Response(cache.data, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cache': 'ERROR-FALLBACK' },
      });
    }
    return new Response(JSON.stringify({ error: 'Failed to fetch crypto report' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
