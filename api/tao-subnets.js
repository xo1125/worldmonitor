export const config = { runtime: 'edge' };

// Simple in-memory cache
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Subnet definitions — static config, enriched with live data when available
const SUBNETS = [
  { name: 'Chutes', netuid: 64 },
  { name: 'Targon', netuid: 4 },
  { name: 'affine', netuid: 120 },
  { name: 'lium', netuid: 51 },
  { name: 'templar', netuid: 3 },
  { name: 'Ridges AI', netuid: 62 },
  { name: 'Score', netuid: 44 },
  { name: 'iota', netuid: 9 },
  { name: '404-GEN', netuid: 17 },
  { name: 'Synth', netuid: 50 },
  { name: 'Sportstensor', netuid: 41 },
  { name: 'Bitsec.ai', netuid: 60 },
  { name: 'Inspect', netuid: 'INSP' },
];

async function fetchSubnetData(netuid) {
  try {
    // Try taostats API for subnet info
    const url = `https://taostats.io/api/subnet/v1/${netuid}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/1.0',
      },
    });

    if (!response.ok) return null;
    const data = await response.json();

    return {
      emissions: data.emission || data.emissions || null,
      validators: data.active_validators || data.validators || null,
      registrations: data.registrations || null,
      miners: data.active_miners || data.miners || null,
    };
  } catch {
    return null;
  }
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
    // Fetch live data for numeric netuids in parallel
    const numericSubnets = SUBNETS.filter(s => typeof s.netuid === 'number');
    const liveResults = await Promise.allSettled(
      numericSubnets.map(s => fetchSubnetData(s.netuid))
    );

    // Build live data map
    const liveDataMap = {};
    numericSubnets.forEach((s, i) => {
      const result = liveResults[i];
      if (result.status === 'fulfilled' && result.value) {
        liveDataMap[s.netuid] = result.value;
      }
    });

    // Merge static + live data
    const subnets = SUBNETS.map(s => {
      const live = typeof s.netuid === 'number' ? liveDataMap[s.netuid] : null;
      return {
        name: s.name,
        netuid: s.netuid,
        status: live ? 'active' : 'unknown',
        emissions: live?.emissions || null,
        validators: live?.validators || null,
        registrations: live?.registrations || null,
        miners: live?.miners || null,
      };
    });

    const responseBody = JSON.stringify({ subnets, lastUpdated: new Date().toISOString() });

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

    // Return static fallback
    const fallback = SUBNETS.map(s => ({
      name: s.name,
      netuid: s.netuid,
      status: 'unknown',
      emissions: null,
      validators: null,
      registrations: null,
      miners: null,
    }));

    return new Response(JSON.stringify({ subnets: fallback, lastUpdated: new Date().toISOString() }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
