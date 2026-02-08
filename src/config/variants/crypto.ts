// Crypto variant - crypto.worldmonitor.app
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

// Re-export base config
export * from './base';

// Crypto-focused feeds (subset of full feeds config)
export {
  SOURCE_TIERS,
  getSourceTier,
  SOURCE_TYPES,
  getSourceType,
  getSourcePropagandaRisk,
  type SourceRiskProfile,
  type SourceType,
} from '../feeds';

// Crypto-specific FEEDS configuration
import type { Feed } from '@/types';

const rss = (url: string) => `/api/rss-proxy?url=${encodeURIComponent(url)}`;

export const FEEDS: Record<string, Feed[]> = {
  // Bitcoin-specific news
  bitcoin: [
    { name: 'Bitcoin Magazine', url: rss('https://bitcoinmagazine.com/.rss/full/') },
    { name: 'CoinDesk Bitcoin', url: rss('https://www.coindesk.com/arc/outboundfeeds/rss/category/markets/') },
    { name: 'Bitcoin News', url: rss('https://news.google.com/rss/search?q=Bitcoin+price+OR+Bitcoin+halving+OR+Bitcoin+mining+when:2d&hl=en-US&gl=US&ceid=US:en') },
  ],

  // Ethereum-specific news
  ethereum: [
    { name: 'Ethereum News', url: rss('https://news.google.com/rss/search?q=Ethereum+OR+ETH+price+OR+Ethereum+upgrade+OR+Ethereum+staking+when:2d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'CoinDesk Ethereum', url: rss('https://news.google.com/rss/search?q=site:coindesk.com+Ethereum+when:3d&hl=en-US&gl=US&ceid=US:en') },
  ],

  // Altcoins (SOL, TAO, AERO, etc.)
  altcoins: [
    { name: 'Altcoin News', url: rss('https://news.google.com/rss/search?q=(Solana+OR+Bittensor+OR+TAO+OR+Aerodrome+OR+AERO)+crypto+when:3d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'CryptoSlate', url: rss('https://cryptoslate.com/feed/') },
    { name: 'Altcoin Buzz', url: rss('https://news.google.com/rss/search?q=(altcoin+OR+"alt+season"+OR+Cardano+OR+XRP+OR+Polkadot+OR+Avalanche+OR+Chainlink)+when:2d&hl=en-US&gl=US&ceid=US:en') },
  ],

  // DeFi
  defi: [
    { name: 'DeFi News', url: rss('https://news.google.com/rss/search?q=DeFi+OR+"decentralized+finance"+OR+Uniswap+OR+Aave+OR+MakerDAO+when:2d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'The Defiant', url: rss('https://thedefiant.io/feed') },
    { name: 'DeFi Protocols', url: rss('https://news.google.com/rss/search?q=(Lido+OR+Curve+OR+Compound+OR+"yield+farming"+OR+"liquidity+pool")+DeFi+when:3d&hl=en-US&gl=US&ceid=US:en') },
  ],

  // NFT & Digital Assets
  nft: [
    { name: 'NFT News', url: rss('https://news.google.com/rss/search?q=NFT+OR+"non-fungible+token"+OR+OpenSea+OR+CryptoPunks+OR+"digital+art"+blockchain+when:3d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'NFT Evening', url: rss('https://nftevening.com/feed/') },
  ],

  // Crypto Regulation & Policy
  regulation: [
    { name: 'Crypto Regulation', url: rss('https://news.google.com/rss/search?q=crypto+regulation+OR+SEC+crypto+OR+CFTC+bitcoin+OR+"crypto+law"+when:3d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'Stablecoin Policy', url: rss('https://news.google.com/rss/search?q=(MiCA+OR+"stablecoin+regulation"+OR+"crypto+tax"+OR+"crypto+ban")+when:7d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'Enforcement', url: rss('https://news.google.com/rss/search?q=(SEC+enforcement+crypto+OR+DOJ+crypto+OR+CFTC+enforcement+OR+"crypto+fraud")+when:7d&hl=en-US&gl=US&ceid=US:en') },
  ],

  // Trading & Market Analysis
  trading: [
    { name: 'CoinDesk', url: rss('https://www.coindesk.com/arc/outboundfeeds/rss/') },
    { name: 'CoinTelegraph', url: rss('https://cointelegraph.com/rss') },
    { name: 'The Block', url: rss('https://www.theblock.co/rss.xml') },
    { name: 'Decrypt', url: rss('https://decrypt.co/feed') },
    { name: 'Blockworks', url: rss('https://blockworks.co/feed') },
    { name: 'DL News', url: rss('https://www.dlnews.com/feed/') },
    { name: 'Wu Blockchain', url: rss('https://news.google.com/rss/search?q="Wu+Blockchain"+OR+site:wublock.substack.com+when:3d&hl=en-US&gl=US&ceid=US:en') },
  ],

  // Crypto Finance (institutional, macro)
  finance: [
    { name: 'CNBC Crypto', url: rss('https://www.cnbc.com/id/33002080/device/rss/rss.html') },
    { name: 'Bloomberg Crypto', url: rss('https://news.google.com/rss/search?q=site:bloomberg.com+crypto+OR+bitcoin+when:2d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'Reuters Crypto', url: rss('https://news.google.com/rss/search?q=site:reuters.com+cryptocurrency+OR+bitcoin+OR+stablecoin+when:3d&hl=en-US&gl=US&ceid=US:en') },
    { name: 'Yahoo Finance Crypto', url: rss('https://finance.yahoo.com/rss/topstories') },
    { name: 'Unchained', url: rss('https://unchainedcrypto.com/feed/') },
    { name: 'Messari', url: rss('https://news.google.com/rss/search?q=site:messari.io+OR+"Messari"+crypto+research+when:3d&hl=en-US&gl=US&ceid=US:en') },
  ],
};

// Panel configuration for crypto variant — command center layout order
// Panel layout: key panels first, signals compact, news at bottom
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  // ── Signal Cards (compact top row) ──
  'signal-liquidity': { name: 'Liquidity', enabled: true, priority: 1 },
  'signal-flow': { name: 'Flow Structure', enabled: true, priority: 1 },
  'signal-macro': { name: 'Macro Regime', enabled: true, priority: 1 },
  'signal-technical': { name: 'Technical Trend', enabled: true, priority: 1 },
  'signal-hashrate': { name: 'Hash Rate', enabled: true, priority: 1 },
  'signal-feargreed': { name: 'Fear & Greed', enabled: true, priority: 1 },

  // ── Core panels (hero row — most important) ──
  'btc-monitor': { name: 'BTC Monitor', enabled: true, priority: 1 },
  crypto: { name: 'Crypto Prices', enabled: true, priority: 1 },
  watchlist: { name: 'Watchlist', enabled: true, priority: 1 },
  commodities: { name: 'Commodities / VIX', enabled: true, priority: 1 },

  // ── Market Data ──
  'etf-flows': { name: 'BTC ETF Tracker', enabled: true, priority: 1 },
  'stablecoin-supply': { name: 'Stablecoins', enabled: true, priority: 1 },
  'crypto-heatmap': { name: 'Crypto Sectors', enabled: true, priority: 1 },

  // ── News ──
  'live-news': { name: 'Crypto Headlines', enabled: true, priority: 1 },
  trading: { name: 'Trading & Analysis', enabled: true, priority: 1 },
  finance: { name: 'Crypto Finance', enabled: true, priority: 1 },
  regulation: { name: 'Crypto Regulation', enabled: true, priority: 1 },
  polymarket: { name: 'Crypto Predictions', enabled: true, priority: 2 },
  monitors: { name: 'My Monitors', enabled: true, priority: 2 },
};

// Crypto variant does not use the map - empty layers (all false)
export const DEFAULT_MAP_LAYERS: MapLayers = {
  conflicts: false,
  bases: false,
  cables: false,
  pipelines: false,
  hotspots: false,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: false,
  economic: false,
  waterways: false,
  outages: false,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
};

// Mobile defaults (same as desktop since no map)
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = { ...DEFAULT_MAP_LAYERS };

export const VARIANT_CONFIG: VariantConfig = {
  name: 'crypto',
  description: 'Cryptocurrency intelligence dashboard',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
