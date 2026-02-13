export type PropagandaRisk = 'low' | 'medium' | 'high';

export interface Feed {
  name: string;
  url: string;
  type?: string;
  region?: string;
  propagandaRisk?: PropagandaRisk;
  stateAffiliated?: string;
}

export type { ThreatClassification, ThreatLevel, EventCategory } from '@/services/threat-classifier';

export interface NewsItem {
  source: string;
  title: string;
  link: string;
  pubDate: Date;
  isAlert: boolean;
  monitorColor?: string;
  tier?: number;
  threat?: import('@/services/threat-classifier').ThreatClassification;
  lat?: number;
  lon?: number;
  locationName?: string;
}

export type VelocityLevel = 'normal' | 'elevated' | 'spike';
export type SentimentType = 'negative' | 'neutral' | 'positive';
export type DeviationLevel = 'normal' | 'elevated' | 'spike' | 'quiet';

export interface VelocityMetrics {
  sourcesPerHour: number;
  level: VelocityLevel;
  trend: 'rising' | 'stable' | 'falling';
  sentiment: SentimentType;
  sentimentScore: number;
}

export interface ClusteredEvent {
  id: string;
  primaryTitle: string;
  primarySource: string;
  primaryLink: string;
  sourceCount: number;
  topSources: Array<{ name: string; tier: number; url: string }>;
  allItems: NewsItem[];
  firstSeen: Date;
  lastUpdated: Date;
  isAlert: boolean;
  monitorColor?: string;
  velocity?: VelocityMetrics;
  threat?: import('@/services/threat-classifier').ThreatClassification;
  lat?: number;
  lon?: number;
}

export interface Sector {
  symbol: string;
  name: string;
}

export interface Commodity {
  symbol: string;
  name: string;
  display: string;
}

export interface MarketSymbol {
  symbol: string;
  name: string;
  display: string;
}

export interface MarketData {
  symbol: string;
  name: string;
  display: string;
  price: number | null;
  change: number | null;
}

export interface CryptoData {
  name: string;
  symbol: string;
  price: number;
  change: number;
}

export interface StablecoinData {
  name: string;
  symbol: string;
  price: number;
  change: number;
  change7d: number;
  marketCap: number;
  volume24h: number;
  mcapChange24h: number;
  pegStatus?: 'ON_PEG' | 'SLIGHT_DEPEG' | 'DEPEGGED';
  pegDeviation?: number;
}

export interface StablecoinSummary {
  totalMarketCap: number;
  totalVolume24h: number;
  depeggedCount: number;
  healthStatus: 'HEALTHY' | 'CAUTION' | 'WARNING';
  coinCount: number;
}

export interface StablecoinResponse {
  coins: StablecoinData[];
  summary: StablecoinSummary;
}

export interface CryptoSectorData {
  name: string;
  change: number;
  coins: Array<{ name: string; symbol: string; change: number }>;
}

export type MacroSignalStatus = 'bullish' | 'bearish' | 'neutral';

export interface MacroSignal {
  name: string;
  label: string;
  status: MacroSignalStatus;
  value: string;
  detail: string;
  sparkline?: number[];
  supportingData?: Record<string, string>;
}

export interface MacroSignalResult {
  verdict: 'BUY' | 'CASH';
  signals: MacroSignal[];
  lastUpdated: Date;
}

// Watchlist token data
export interface WatchlistData {
  name: string;
  symbol: string;
  price: number;
  change: number;
  marketCap?: number;
  volume?: number;
  conviction: 'high' | 'low';
  sector: string;
  tag?: string;
}

// TAO Subnet data
export interface TaoSubnet {
  name: string;
  netuid: number | string;
  emissions?: number;
  validators?: number;
  registrations?: number;
  status: 'active' | 'inactive' | 'unknown';
  taoPrice?: number;
  taoChange?: number;
}

export interface Monitor {
  id: string;
  keywords: string[];
  color: string;
  name?: string;
  lat?: number;
  lon?: number;
}

export interface PanelConfig {
  name: string;
  enabled: boolean;
  priority?: number;
}

export interface MapLayers {
  conflicts: boolean;
  bases: boolean;
  cables: boolean;
  pipelines: boolean;
  hotspots: boolean;
  ais: boolean;
  nuclear: boolean;
  irradiators: boolean;
  sanctions: boolean;
  weather: boolean;
  economic: boolean;
  waterways: boolean;
  outages: boolean;
  datacenters: boolean;
  protests: boolean;
  flights: boolean;
  military: boolean;
  natural: boolean;
  spaceports: boolean;
  minerals: boolean;
  fires: boolean;
  startupHubs: boolean;
  cloudRegions: boolean;
  accelerators: boolean;
  techHQs: boolean;
  techEvents: boolean;
}

export interface PredictionMarket {
  title: string;
  yesPrice: number;
  volume?: number;
  url?: string;
}

export interface AppState {
  currentView: 'global' | 'us';
  mapZoom: number;
  mapPan: { x: number; y: number };
  mapLayers: MapLayers;
  panels: Record<string, PanelConfig>;
  monitors: Monitor[];
  allNews: NewsItem[];
  isLoading: boolean;
}

export type FeedCategory = 'politics' | 'tech' | 'finance' | 'gov' | 'intel';

// Focal Point Detection (Intelligence Synthesis)
export type FocalPointUrgency = 'watch' | 'elevated' | 'critical';

export interface HeadlineWithUrl {
  title: string;
  url: string;
}

export interface EntityMention {
  entityId: string;
  entityType: 'country' | 'company' | 'index' | 'commodity' | 'crypto' | 'sector';
  displayName: string;
  mentionCount: number;
  avgConfidence: number;
  clusterIds: string[];
  topHeadlines: HeadlineWithUrl[];
}

export interface FocalPoint {
  id: string;
  entityId: string;
  entityType: 'country' | 'company' | 'index' | 'commodity' | 'crypto' | 'sector';
  displayName: string;
  newsMentions: number;
  newsVelocity: number;
  topHeadlines: HeadlineWithUrl[];
  signalTypes: string[];
  signalCount: number;
  highSeverityCount: number;
  signalDescriptions: string[];
  focalScore: number;
  urgency: FocalPointUrgency;
  narrative: string;
  correlationEvidence: string[];
}

export interface FocalPointSummary {
  timestamp: Date;
  focalPoints: FocalPoint[];
  aiContext: string;
  topCountries: FocalPoint[];
  topCompanies: FocalPoint[];
}
