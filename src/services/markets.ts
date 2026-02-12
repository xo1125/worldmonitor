import type { MarketData, CryptoData, StablecoinData, CryptoSectorData, MacroSignalResult, WatchlistData, TaoSubnet } from '@/types';
import { API_URLS, CRYPTO_MAP, CRYPTO_IDS, STABLECOIN_MAP, CRYPTO_SECTORS, WATCHLIST_MAP, WATCHLIST_IDS, TAO_SUBNETS } from '@/config';
import { fetchWithProxy } from '@/utils';

interface FinnhubQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
  error?: string;
}

interface FinnhubResponse {
  quotes: FinnhubQuote[];
  error?: string;
}

interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
    }>;
  };
}

interface CoinGeckoResponse {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
  };
}

// Symbols that need Yahoo Finance (indices and futures not supported by Finnhub free tier)
const YAHOO_ONLY_SYMBOLS = new Set([
  '^GSPC', '^DJI', '^IXIC', '^VIX',
  'GC=F', 'CL=F', 'NG=F', 'SI=F', 'HG=F',
]);

let lastSuccessfulResults: MarketData[] = [];

async function fetchFromFinnhub(
  symbols: Array<{ symbol: string; name: string; display: string }>
): Promise<MarketData[]> {
  const symbolList = symbols.map(s => s.symbol);
  const url = API_URLS.finnhub(symbolList);

  try {
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      console.warn(`[Markets] Finnhub returned ${response.status}`);
      return [];
    }

    const data: FinnhubResponse = await response.json();

    if (data.error) {
      console.warn(`[Markets] Finnhub error: ${data.error}`);
      return [];
    }

    const symbolMap = new Map(symbols.map(s => [s.symbol, s]));

    return data.quotes
      .filter(q => !q.error && q.price > 0)
      .map(q => {
        const info = symbolMap.get(q.symbol);
        return {
          symbol: q.symbol,
          name: info?.name || q.symbol,
          display: info?.display || q.symbol,
          price: q.price,
          change: q.changePercent,
        };
      });
  } catch (error) {
    console.error('[Markets] Finnhub fetch failed:', error);
    return [];
  }
}

async function fetchFromYahoo(
  symbol: string,
  name: string,
  display: string
): Promise<MarketData | null> {
  try {
    const url = API_URLS.yahooFinance(symbol);
    const response = await fetchWithProxy(url);

    if (!response.ok) return null;
    const data: YahooFinanceResponse = await response.json();

    const meta = data.chart.result[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const change = ((price - prevClose) / prevClose) * 100;

    return { symbol, name, display, price, change };
  } catch {
    return null;
  }
}

export async function fetchMultipleStocks(
  symbols: Array<{ symbol: string; name: string; display: string }>,
  options: {
    onBatch?: (results: MarketData[]) => void;
  } = {}
): Promise<MarketData[]> {
  // Split symbols into Finnhub-compatible and Yahoo-only
  const finnhubSymbols = symbols.filter(s => !YAHOO_ONLY_SYMBOLS.has(s.symbol));
  const yahooSymbols = symbols.filter(s => YAHOO_ONLY_SYMBOLS.has(s.symbol));

  const results: MarketData[] = [];

  // Fetch from Finnhub (batch request)
  if (finnhubSymbols.length > 0) {
    const finnhubResults = await fetchFromFinnhub(finnhubSymbols);
    results.push(...finnhubResults);
    options.onBatch?.(results);
  }

  // Fetch indices/commodities from Yahoo (parallel)
  if (yahooSymbols.length > 0) {
    const yahooResults = await Promise.all(
      yahooSymbols.map(s => fetchFromYahoo(s.symbol, s.name, s.display))
    );
    results.push(...yahooResults.filter((r): r is MarketData => r !== null));
    options.onBatch?.(results);
  }

  if (results.length > 0) {
    lastSuccessfulResults = results;
  }

  return results.length > 0 ? results : lastSuccessfulResults;
}

// Legacy single-symbol function (still used by some components)
export async function fetchStockQuote(
  symbol: string,
  name: string,
  display: string
): Promise<MarketData> {
  if (YAHOO_ONLY_SYMBOLS.has(symbol)) {
    const result = await fetchFromYahoo(symbol, name, display);
    return result || { symbol, name, display, price: null, change: null };
  }

  const results = await fetchFromFinnhub([{ symbol, name, display }]);
  return results[0] || { symbol, name, display, price: null, change: null };
}

// Shared CoinGecko batch response (crypto + watchlist in one call)
let _batchCache: { data: CoinGeckoExtendedResponse | null; timestamp: number } = { data: null, timestamp: 0 };
const BATCH_TTL = 90_000; // 90s

async function fetchCryptoBatch(): Promise<CoinGeckoExtendedResponse> {
  if (_batchCache.data && Date.now() - _batchCache.timestamp < BATCH_TTL) {
    return _batchCache.data;
  }
  // Merge crypto + watchlist IDs into a single CoinGecko call
  const allIds = [...new Set([...CRYPTO_IDS, ...WATCHLIST_IDS])].join(',');
  const url = `/api/coingecko?ids=${allIds}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  const response = await fetchWithProxy(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: CoinGeckoExtendedResponse = await response.json();
  _batchCache = { data, timestamp: Date.now() };
  return data;
}

export async function fetchCrypto(): Promise<CryptoData[]> {
  try {
    const data = await fetchCryptoBatch();
    return Object.entries(CRYPTO_MAP).map(([id, info]) => {
      const coinData = data[id];
      return {
        name: info.name,
        symbol: info.symbol,
        price: coinData?.usd ?? 0,
        change: coinData?.usd_24h_change ?? 0,
      };
    });
  } catch (e) {
    console.error('Failed to fetch crypto:', e);
    return [];
  }
}

// Extended CoinGecko response with market cap and volume
interface CoinGeckoExtendedResponse {
  [key: string]: {
    usd: number;
    usd_24h_change: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
  };
}

export async function fetchStablecoins(): Promise<StablecoinData[]> {
  try {
    const ids = Object.keys(STABLECOIN_MAP).join(',');
    // Use /coins/markets for 7d change and mcap change data
    const url = `/api/stablecoin-markets?ids=${ids}`;
    const response = await fetchWithProxy(url);
    if (!response.ok) {
      // Fallback to simple/price if markets endpoint fails
      return fetchStablecoinsFallback();
    }
    const coins: Array<{
      id: string;
      current_price: number;
      price_change_percentage_24h: number;
      price_change_percentage_7d_in_currency: number;
      market_cap: number;
      total_volume: number;
      market_cap_change_24h: number;
    }> = await response.json();

    return coins.map(coin => {
      const info = STABLECOIN_MAP[coin.id];
      return {
        name: info?.name ?? coin.id,
        symbol: info?.symbol ?? coin.id.toUpperCase(),
        price: coin.current_price ?? 1.0,
        change: coin.price_change_percentage_24h ?? 0,
        change7d: coin.price_change_percentage_7d_in_currency ?? 0,
        marketCap: coin.market_cap ?? 0,
        volume24h: coin.total_volume ?? 0,
        mcapChange24h: coin.market_cap_change_24h ?? 0,
      };
    });
  } catch (e) {
    console.error('Failed to fetch stablecoins:', e);
    return fetchStablecoinsFallback();
  }
}

async function fetchStablecoinsFallback(): Promise<StablecoinData[]> {
  try {
    const ids = Object.keys(STABLECOIN_MAP).join(',');
    const url = `/api/coingecko?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
    const response = await fetchWithProxy(url);
    if (!response.ok) return [];
    const data: CoinGeckoExtendedResponse = await response.json();

    return Object.entries(STABLECOIN_MAP).map(([id, info]) => {
      const coinData = data[id];
      return {
        name: info.name,
        symbol: info.symbol,
        price: coinData?.usd ?? 1.0,
        change: coinData?.usd_24h_change ?? 0,
        change7d: 0,
        marketCap: coinData?.usd_market_cap ?? 0,
        volume24h: coinData?.usd_24h_vol ?? 0,
        mcapChange24h: 0,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchCryptoSectors(): Promise<CryptoSectorData[]> {
  try {
    // Collect all unique coin IDs from sectors
    const allIds = new Set<string>();
    CRYPTO_SECTORS.forEach(sector => sector.coins.forEach(id => allIds.add(id)));
    const ids = Array.from(allIds).join(',');

    const url = `/api/coingecko?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const response = await fetchWithProxy(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: CoinGeckoResponse = await response.json();

    return CRYPTO_SECTORS.map(sector => {
      const coins = sector.coins
        .filter(id => data[id])
        .map(id => ({
          name: id,
          symbol: id,
          change: data[id]?.usd_24h_change ?? 0,
        }));

      const avgChange = coins.length > 0
        ? coins.reduce((sum, c) => sum + c.change, 0) / coins.length
        : 0;

      return {
        name: sector.name,
        change: avgChange,
        coins,
      };
    });
  } catch (e) {
    console.error('Failed to fetch crypto sectors:', e);
    return [];
  }
}

export async function fetchMacroSignals(): Promise<MacroSignalResult | null> {
  try {
    const response = await fetchWithProxy('/api/macro-signals');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      ...data,
      lastUpdated: new Date(data.lastUpdated),
    };
  } catch (e) {
    console.error('Failed to fetch macro signals:', e);
    return null;
  }
}

// Watchlist token prices (shares batch with fetchCrypto to avoid rate limits)
export async function fetchWatchlist(): Promise<WatchlistData[]> {
  try {
    const data = await fetchCryptoBatch();
    return Object.entries(WATCHLIST_MAP).map(([id, info]) => {
      const coinData = data[id];
      return {
        name: info.name,
        symbol: info.symbol,
        price: coinData?.usd ?? 0,
        change: coinData?.usd_24h_change ?? 0,
        marketCap: coinData?.usd_market_cap ?? undefined,
        volume: coinData?.usd_24h_vol ?? undefined,
        conviction: info.conviction,
        sector: info.sector,
        tag: info.tag,
      };
    });
  } catch (e) {
    console.error('Failed to fetch watchlist:', e);
    return [];
  }
}

// TAO Subnet data (TAO price from shared batch to avoid extra CoinGecko call)
export async function fetchTaoSubnets(): Promise<TaoSubnet[]> {
  try {
    // Fetch subnets from API; TAO price comes from shared batch
    const [subnetResponse, batchData] = await Promise.all([
      fetchWithProxy('/api/tao-subnets'),
      fetchCryptoBatch().catch(() => null),
    ]);

    let taoPrice: number | undefined;
    let taoChange: number | undefined;
    if (batchData?.bittensor) {
      taoPrice = batchData.bittensor.usd;
      taoChange = batchData.bittensor.usd_24h_change;
    }

    if (!subnetResponse.ok) throw new Error(`HTTP ${subnetResponse.status}`);
    const data = await subnetResponse.json();
    const subnets = data.subnets || TAO_SUBNETS.map(s => ({
      name: s.name,
      netuid: s.netuid,
      status: 'unknown' as const,
    }));

    return subnets.map((s: TaoSubnet) => ({ ...s, taoPrice, taoChange }));
  } catch (e) {
    console.error('Failed to fetch TAO subnets:', e);
    return TAO_SUBNETS.map(s => ({
      name: s.name,
      netuid: s.netuid,
      status: 'unknown' as const,
    }));
  }
}

// ETF Flows data
export interface ETFFlowsResult {
  source: string;
  etfs: Array<{
    ticker: string;
    issuer: string;
    dailyNetInflow: number | null;
    flowStatus?: number;
    netAssets: number | null;
    volume: number | null;
    cumNetInflow?: number | null;
    fee?: number | null;
  }>;
  aggregate: {
    dailyNetInflow: number;
    totalVolume: number;
    totalNetAssets: number;
    cumNetInflow: number;
    etfCount: number;
  };
  lastUpdated: string;
}

export async function fetchETFFlows(): Promise<ETFFlowsResult | null> {
  try {
    const response = await fetchWithProxy('/api/etf-flows');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error('Failed to fetch ETF flows:', e);
    return null;
  }
}

export interface BTCLevel {
  value: number;
  source: 'api' | 'fallback' | 'computed' | 'derived';
  label: string;
  tag: string;
}

export interface BTCLevelsResult {
  price: number;
  levels: {
    sth_rp: BTCLevel;
    true_mean: BTCLevel;
    wma_200: BTCLevel;
    realized: BTCLevel;
  };
  regime: 'BULL' | 'DEFENSIVE' | 'BEAR' | 'FLOOR_TEST';
  risk_score: number;
  retest_proximity: number;
  dead_cat_warning: boolean;
  price_history_30d: number[];
  lastUpdated: string;
}

export async function fetchBTCLevels(): Promise<BTCLevelsResult | null> {
  try {
    const response = await fetchWithProxy('/api/btc-levels');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error('Failed to fetch BTC levels:', e);
    return null;
  }
}
