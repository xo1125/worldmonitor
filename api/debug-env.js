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
    // Shape only — never the value. A rediss:// endpoint pasted into the REST
    // variable is the usual cause of an otherwise unexplained write failure.
    UPSTASH_URL_SHAPE: (() => {
      const raw = process.env.UPSTASH_REDIS_REST_URL || '';
      if (!raw) return 'missing';
      const u = raw.trim().replace(/\/+$/, '');
      const host = (u.split('://')[1] || '').split('/')[0];
      const suffix = host.split('.').slice(-2).join('.');
      return `${u.split('://')[0]}:// · domain ${suffix} · len ${raw.length}` +
             (raw !== raw.trim() ? ' · WHITESPACE' : '') +
             (raw !== u && raw.trim().endsWith('/') ? ' · TRAILING SLASH' : '') +
             (/["']/.test(raw) ? ' · QUOTES' : '');
    })(),
    // Which Redis-ish variables this deployment has at all (names only).
    REDIS_VARS_PRESENT: [
      'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
      'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_URL', 'REDIS_URL',
    ].filter(k => process.env[k]).join(', ') || 'none',
    UPSTASH_TOKEN_SHAPE: (() => {
      const t = process.env.UPSTASH_REDIS_REST_TOKEN || '';
      if (!t) return 'missing';
      return `len ${t.length}` + (t !== t.trim() ? ' · HAS WHITESPACE' : '') +
             (/["']/.test(t) ? ' · HAS QUOTES' : '');
    })(),
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
