// Configuration exports — crypto-only build

// Shared base configuration
export {
  API_URLS,
  REFRESH_INTERVALS,
  MONITOR_COLORS,
  STORAGE_KEYS,
} from './variants/base';

// Market data
export { SECTORS, COMMODITIES, MARKET_SYMBOLS, CRYPTO_MAP, CRYPTO_IDS, STABLECOIN_IDS, STABLECOIN_MAP, CRYPTO_SECTORS, WATCHLIST_MAP, WATCHLIST_IDS, TAO_SUBNETS } from './markets';
export type { CryptoSector, TaoSubnetConfig } from './markets';

// Feeds configuration
export {
  SOURCE_TIERS,
  getSourceTier,
  SOURCE_TYPES,
  getSourceType,
  getSourcePropagandaRisk,
  ALERT_KEYWORDS,
  ALERT_EXCLUSIONS,
  type SourceRiskProfile,
  type SourceType,
  FEEDS,
  INTEL_SOURCES,
} from './feeds';

// Panel configuration (crypto-only)
export {
  DEFAULT_PANELS,
  DEFAULT_MAP_LAYERS,
  MOBILE_DEFAULT_MAP_LAYERS,
} from './panels';
