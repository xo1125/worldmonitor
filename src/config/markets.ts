import type { Sector, Commodity, MarketSymbol } from '@/types';

export const SECTORS: Sector[] = [
  { symbol: 'XLK', name: 'Tech' },
  { symbol: 'XLF', name: 'Finance' },
  { symbol: 'XLE', name: 'Energy' },
  { symbol: 'XLV', name: 'Health' },
  { symbol: 'XLY', name: 'Consumer' },
  { symbol: 'XLI', name: 'Industrial' },
  { symbol: 'XLP', name: 'Staples' },
  { symbol: 'XLU', name: 'Utilities' },
  { symbol: 'XLB', name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Est' },
  { symbol: 'XLC', name: 'Comms' },
  { symbol: 'SMH', name: 'Semis' },
];

export const COMMODITIES: Commodity[] = [
  { symbol: '^VIX', name: 'VIX', display: 'VIX' },
  { symbol: 'GC=F', name: 'Gold', display: 'GOLD' },
  { symbol: 'CL=F', name: 'Crude Oil', display: 'OIL' },
  { symbol: 'NG=F', name: 'Natural Gas', display: 'NATGAS' },
  { symbol: 'SI=F', name: 'Silver', display: 'SILVER' },
  { symbol: 'HG=F', name: 'Copper', display: 'COPPER' },
];

export const MARKET_SYMBOLS: MarketSymbol[] = [
  { symbol: '^GSPC', name: 'S&P 500', display: 'SPX' },
  { symbol: '^DJI', name: 'Dow Jones', display: 'DOW' },
  { symbol: '^IXIC', name: 'NASDAQ', display: 'NDX' },
  { symbol: 'AAPL', name: 'Apple', display: 'AAPL' },
  { symbol: 'MSFT', name: 'Microsoft', display: 'MSFT' },
  { symbol: 'NVDA', name: 'NVIDIA', display: 'NVDA' },
  { symbol: 'GOOGL', name: 'Alphabet', display: 'GOOGL' },
  { symbol: 'AMZN', name: 'Amazon', display: 'AMZN' },
  { symbol: 'META', name: 'Meta', display: 'META' },
  { symbol: 'BRK-B', name: 'Berkshire', display: 'BRK.B' },
  { symbol: 'TSM', name: 'TSMC', display: 'TSM' },
  { symbol: 'LLY', name: 'Eli Lilly', display: 'LLY' },
  { symbol: 'TSLA', name: 'Tesla', display: 'TSLA' },
  { symbol: 'AVGO', name: 'Broadcom', display: 'AVGO' },
  { symbol: 'WMT', name: 'Walmart', display: 'WMT' },
  { symbol: 'JPM', name: 'JPMorgan', display: 'JPM' },
  { symbol: 'V', name: 'Visa', display: 'V' },
  { symbol: 'UNH', name: 'UnitedHealth', display: 'UNH' },
  { symbol: 'NVO', name: 'Novo Nordisk', display: 'NVO' },
  { symbol: 'XOM', name: 'Exxon', display: 'XOM' },
  { symbol: 'MA', name: 'Mastercard', display: 'MA' },
  { symbol: 'ORCL', name: 'Oracle', display: 'ORCL' },
  { symbol: 'PG', name: 'P&G', display: 'PG' },
  { symbol: 'COST', name: 'Costco', display: 'COST' },
  { symbol: 'JNJ', name: 'J&J', display: 'JNJ' },
  { symbol: 'HD', name: 'Home Depot', display: 'HD' },
  { symbol: 'NFLX', name: 'Netflix', display: 'NFLX' },
  { symbol: 'BAC', name: 'BofA', display: 'BAC' },
];

const SITE_VARIANT = import.meta.env.VITE_VARIANT || 'full';

const CRYPTO_MAP_BASE: Record<string, { name: string; symbol: string }> = {
  bitcoin: { name: 'Bitcoin', symbol: 'BTC' },
  ethereum: { name: 'Ethereum', symbol: 'ETH' },
  solana: { name: 'Solana', symbol: 'SOL' },
};

const CRYPTO_MAP_EXTENDED: Record<string, { name: string; symbol: string }> = {
  ...CRYPTO_MAP_BASE,
  bittensor: { name: 'Bittensor', symbol: 'TAO' },
  'aerodrome-finance': { name: 'Aerodrome', symbol: 'AERO' },
  zama: { name: 'Zama', symbol: 'ZAMA' },
};

export const CRYPTO_MAP = SITE_VARIANT === 'crypto' ? CRYPTO_MAP_EXTENDED : CRYPTO_MAP_BASE;
export const CRYPTO_IDS = Object.keys(CRYPTO_MAP);

// Stablecoin tracking (used by crypto variant)
export const STABLECOIN_IDS = ['tether', 'usd-coin', 'dai'] as const;
export const STABLECOIN_MAP: Record<string, { name: string; symbol: string }> = {
  tether: { name: 'Tether', symbol: 'USDT' },
  'usd-coin': { name: 'USD Coin', symbol: 'USDC' },
  dai: { name: 'Dai', symbol: 'DAI' },
};

// Crypto sector definitions for heatmap (used by crypto variant)
export interface CryptoSector {
  name: string;
  coins: string[]; // CoinGecko IDs
}

export const CRYPTO_SECTORS: CryptoSector[] = [
  { name: 'Layer 1', coins: ['bitcoin', 'ethereum', 'solana', 'cardano', 'avalanche-2', 'polkadot'] },
  { name: 'DeFi', coins: ['uniswap', 'aave', 'maker', 'lido-dao', 'curve-dao-token', 'compound-governance-token'] },
  { name: 'Layer 2', coins: ['matic-network', 'arbitrum', 'optimism', 'starknet'] },
  { name: 'AI Tokens', coins: ['bittensor', 'render-token', 'fetch-ai', 'ocean-protocol'] },
  { name: 'Memecoins', coins: ['dogecoin', 'shiba-inu', 'pepe', 'bonk'] },
  { name: 'Gaming', coins: ['the-sandbox', 'axie-infinity', 'immutable-x', 'gala'] },
  { name: 'Privacy', coins: ['monero', 'zcash'] },
  { name: 'Infrastructure', coins: ['chainlink', 'the-graph', 'filecoin', 'helium'] },
];
