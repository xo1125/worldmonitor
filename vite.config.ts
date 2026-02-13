import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import pkg from './package.json';

const VARIANT_META = {
  title: 'FC Monitor',
  description: 'Real-time cryptocurrency intelligence dashboard. Bitcoin on-chain levels, ETF flows, stablecoin health, macro signals, and curated crypto news.',
  keywords: 'crypto dashboard, bitcoin monitor, ETF flows, stablecoin tracking, crypto news, DeFi, on-chain analysis, crypto intelligence, BTC levels, fear greed index',
  url: 'https://fcmonitor.com/',
  siteName: 'FC Monitor',
  features: [
    'Real-time crypto price tracking',
    'Cryptocurrency news aggregation',
    'DeFi protocol monitoring',
    'NFT market tracking',
    'Crypto regulation updates',
    'Bitcoin & Ethereum analysis',
    'Altcoin coverage',
    'Stablecoin peg monitoring',
    'Crypto sector heatmap',
    'Macro signal dashboard',
    'Crypto prediction markets',
  ],
};

function htmlVariantPlugin(): Plugin {
  const meta = VARIANT_META;

  return {
    name: 'html-variant',
    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
        .replace(/<meta name="title" content=".*?" \/>/, `<meta name="title" content="${meta.title}" />`)
        .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${meta.description}" />`)
        .replace(/<meta name="keywords" content=".*?" \/>/, `<meta name="keywords" content="${meta.keywords}" />`)
        .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${meta.url}" />`)
        .replace(/<meta name="application-name" content=".*?" \/>/, `<meta name="application-name" content="${meta.siteName}" />`)
        .replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${meta.url}" />`)
        .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${meta.title}" />`)
        .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${meta.description}" />`)
        .replace(/<meta property="og:site_name" content=".*?" \/>/, `<meta property="og:site_name" content="${meta.siteName}" />`)
        .replace(/<meta name="twitter:url" content=".*?" \/>/, `<meta name="twitter:url" content="${meta.url}" />`)
        .replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${meta.title}" />`)
        .replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${meta.description}" />`)
        .replace(/"name": "FC Monitor"/, `"name": "${meta.siteName}"`)
        .replace(/"alternateName": "FCMonitor"/, `"alternateName": "${meta.siteName.replace(' ', '')}"`)
        .replace(/"url": "https:\/\/worldmonitor-crypto\.vercel\.app\/"/, `"url": "${meta.url}"`)
        .replace(/"description": ".*?"/, `"description": "${meta.description}"`)
        .replace(/"featureList": \[[\s\S]*?\]/, `"featureList": ${JSON.stringify(meta.features, null, 8).replace(/\n/g, '\n      ')}`);
    },
  };
}

function youtubeLivePlugin(): Plugin {
  return {
    name: 'youtube-live',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/youtube/live')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const channel = url.searchParams.get('channel');

        if (!channel) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing channel parameter' }));
          return;
        }

        try {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end(JSON.stringify({ videoId: null, channel }));
        } catch (error) {
          console.error(`[YouTube Live] Error:`, error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to fetch', videoId: null }));
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [htmlVariantPlugin(), youtubeLivePlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {},
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Yahoo Finance API
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
      },
      // CoinGecko API
      '/api/coingecko': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const params = url.searchParams.toString();
          return `/api/v3/simple/price${params ? '?' + params : ''}`;
        },
      },
      // Macro Signals - mock in dev
      '/api/macro-signals': {
        target: 'http://localhost:3000',
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, _req, res) => {
            const mockData = JSON.stringify({
              verdict: 'CASH',
              signals: [
                { name: 'Liquidity', label: 'NORMAL', status: 'neutral', value: 'Dev mode', detail: 'Deploy to Vercel for live signals' },
                { name: 'Flow Structure', label: 'ALIGNED', status: 'neutral', value: 'Dev mode', detail: 'Deploy to Vercel for live signals' },
                { name: 'Macro Regime', label: 'RISK-ON', status: 'neutral', value: 'Dev mode', detail: 'Deploy to Vercel for live signals' },
                { name: 'Technical Trend', label: 'NEUTRAL', status: 'neutral', value: 'Dev mode', detail: 'Deploy to Vercel for live signals' },
              ],
              lastUpdated: new Date().toISOString(),
            });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(mockData);
          });
        },
      },
      // Polymarket API
      '/api/polymarket': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/polymarket/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Polymarket proxy error:', err.message);
          });
        },
      },
      // RSS Proxy
      '/api/rss-proxy': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyReq', async (_proxyReq, req, res) => {
            try {
              const reqUrl = new URL(req.url || '', 'http://localhost');
              const feedUrl = reqUrl.searchParams.get('url');
              if (!feedUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing url parameter' }));
                return;
              }
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000);
              const response = await fetch(feedUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 FCMonitor/2.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
              });
              clearTimeout(timeout);
              const text = await response.text();
              res.writeHead(response.status, {
                'Content-Type': response.headers.get('content-type') || 'application/xml',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(text);
            } catch (err: unknown) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
        },
      },
      // Google News RSS
      '/rss/googlenews': {
        target: 'https://news.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/googlenews/, ''),
      },
      // Finance
      '/rss/yahoonews': {
        target: 'https://finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/yahoonews/, ''),
      },
      // CNBC
      '/rss/cnbc': {
        target: 'https://www.cnbc.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/cnbc/, ''),
      },
    },
  },
});
