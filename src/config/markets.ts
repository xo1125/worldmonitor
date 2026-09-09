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
  { symbol: 'DX-Y.NYB', name: 'Dollar Index', display: 'DXY' },
  { symbol: '^VIX', name: 'VIX', display: 'VIX' },
  { symbol: 'GC=F', name: 'Gold', display: 'GOLD' },
  { symbol: 'SI=F', name: 'Silver', display: 'SILVER' },
  { symbol: 'CL=F', name: 'Crude Oil', display: 'OIL' },
  { symbol: 'NG=F', name: 'Natural Gas', display: 'NATGAS' },
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

// Unified portfolio: all tracked tokens with category + conviction
export type PortfolioCategory = 'Bluechips' | 'DeFi' | 'AI' | 'Other';

export interface PortfolioTokenConfig {
  name: string;
  symbol: string;
  category: PortfolioCategory;
  conviction?: 'high' | 'low';
}

export const PORTFOLIO_MAP: Record<string, PortfolioTokenConfig> = {
  // Bluechips
  bitcoin:    { name: 'Bitcoin',      symbol: 'BTC',    category: 'Bluechips' },
  ethereum:   { name: 'Ethereum',     symbol: 'ETH',    category: 'Bluechips' },
  solana:     { name: 'Solana',       symbol: 'SOL',    category: 'Bluechips' },
  // DeFi
  aave:       { name: 'Aave',         symbol: 'AAVE',   category: 'DeFi' },
  'aerodrome-finance': { name: 'Aerodrome', symbol: 'AERO', category: 'DeFi' },
  lighter:    { name: 'Lighter',      symbol: 'LIT',    category: 'DeFi', conviction: 'high' },
  hyperliquid: { name: 'Hyperliquid', symbol: 'HYPE',   category: 'DeFi', conviction: 'high' },
  'canton-network': { name: 'Canton', symbol: 'CC',     category: 'DeFi', conviction: 'low' },
  sky:        { name: 'Sky',          symbol: 'SKY',    category: 'DeFi', conviction: 'low' },
  'jupiter-exchange-solana': { name: 'Jupiter', symbol: 'JUP', category: 'DeFi', conviction: 'low' },
  // AI
  bittensor:  { name: 'Bittensor',    symbol: 'TAO',    category: 'AI' },
  diem:       { name: 'Diem',         symbol: 'DIEM',   category: 'AI' },
  daydreams:  { name: 'Daydreams',    symbol: 'DREAMS', category: 'AI', conviction: 'high' },
  // Other
  fogo:       { name: 'Fogo',         symbol: 'FOGO',   category: 'Other', conviction: 'low' },
  brevis:     { name: 'Brevis',       symbol: 'BREV',   category: 'Other', conviction: 'high' },
  'meta-2-2': { name: 'Meta',         symbol: 'META',   category: 'Other', conviction: 'low' },
  zama:       { name: 'Zama',         symbol: 'ZAMA',   category: 'Other' },
};
export const PORTFOLIO_IDS = Object.keys(PORTFOLIO_MAP);

// Category display order and panel IDs
export const PORTFOLIO_CATEGORY_ORDER: PortfolioCategory[] = ['Bluechips', 'DeFi', 'AI', 'Other'];

// Map category to panel ID
export const CATEGORY_PANEL_IDS: Record<PortfolioCategory, string> = {
  Bluechips: 'tokens-bluechips',
  DeFi: 'tokens-defi',
  AI: 'tokens-ai',
  Other: 'tokens-other',
};

// Legacy aliases (keep backward compat for batch fetch, heatmap, etc.)
export const CRYPTO_MAP: Record<string, { name: string; symbol: string }> = Object.fromEntries(
  Object.entries(PORTFOLIO_MAP).map(([id, cfg]) => [id, { name: cfg.name, symbol: cfg.symbol }])
);
export const CRYPTO_IDS = PORTFOLIO_IDS;
export const WATCHLIST_MAP = PORTFOLIO_MAP;
export const WATCHLIST_IDS = PORTFOLIO_IDS;

// Stablecoin tracking
export const STABLECOIN_IDS = ['tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde'] as const;
export const STABLECOIN_MAP: Record<string, { name: string; symbol: string }> = {
  tether: { name: 'Tether', symbol: 'USDT' },
  'usd-coin': { name: 'USD Coin', symbol: 'USDC' },
  dai: { name: 'Dai', symbol: 'DAI' },
  'first-digital-usd': { name: 'FDUSD', symbol: 'FDUSD' },
  'ethena-usde': { name: 'USDe', symbol: 'USDe' },
};

// Crypto sector definitions for heatmap
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

// TAO Subnet definitions (static config, live data from API)
export interface TaoSubnetConfig {
  name: string;
  netuid: number | string;
}

export const TAO_SUBNETS: TaoSubnetConfig[] = [
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
