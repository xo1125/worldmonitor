// Debug endpoint to check environment variables (remove after testing)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const envStatus = {
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY ? '✓ SET' : '✗ MISSING',
    FRED_API_KEY: process.env.FRED_API_KEY ? '✓ SET' : '✗ MISSING',
    EIA_API_KEY: process.env.EIA_API_KEY ? '✓ SET' : '✗ MISSING',
    ACLED_ACCESS_TOKEN: process.env.ACLED_ACCESS_TOKEN ? '✓ SET' : '✗ MISSING',
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ? '✓ SET' : '✗ MISSING',
    WINGBITS_API_KEY: process.env.WINGBITS_API_KEY ? '✓ SET' : '✗ MISSING',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? '✓ SET' : '✗ MISSING',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? '✓ SET' : '✗ MISSING',
    CRON_SECRET: process.env.CRON_SECRET ? '✓ SET' : '✗ MISSING',
    APIFY_TOKEN: process.env.APIFY_TOKEN ? '✓ SET' : '✗ MISSING',
    NODE_ENV: process.env.NODE_ENV || 'not set',
    VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
  };

  return new Response(JSON.stringify(envStatus, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
