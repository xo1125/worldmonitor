/**
 * Robinhood Chain tab data layer.
 *
 * All of the fan-out (DexScreener, DefiLlama, chain RPC, Apify, snapshot history)
 * happens server-side in /api/robinhood-watchlist, so the client makes exactly one
 * request per refresh and gets a payload that is already normalized.
 */

export type MetricKind = 'usd' | 'pct' | 'count' | 'usdPerToken' | null;

export interface RHMetric {
  label?: string;
  kind: MetricKind;
  value: number | null;
  /** Secondary figure shown under the value (30d total, pairs, borrowed, …). */
  sub?: number | null;
  subLabel?: string;
  source: string;
  url?: string;
  /** Why the value is null, when we know. */
  note?: string;
}

export interface RHToken {
  symbol: string;
  address: string;
  project: string;
  type: string;
  conviction: 'high' | 'low';
  handle: string | null;
  note: string | null;
  explorerUrl: string;
  chartUrl: string;

  price: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  turnover: number | null;
  pairCount: number | null;
  dexes: string[];
  buys24h: number;
  sells24h: number;
  buyRatio: number | null;

  supply: number | null;
  burned: number | null;
  burnPct: number | null;
  backingPerToken: number | null;
  reserveBalance: number | null;
  reserveSymbol: string | null;
  backingRatio: number | null;

  followers: number | null;
  followersChange7d: number | null;

  primary: RHMetric;
  secondary: RHMetric;

  spark: number[];
  mcapChange7d: number | null;
  liqChange24h: number | null;
  liqChange7d: number | null;
  burnChange7d: number | null;
}

export interface RHChain {
  tvl: number | null;
  fees24h: number | null;
  fees7d: number | null;
  fees30d: number | null;
  feesChange1d: number | null;
  feesChange7d: number | null;
  dexVolume24h: number | null;
  dexVolume7d: number | null;
  dexChange1d: number | null;
  dexChange7d: number | null;
  appCount: number | null;
  dexCount: number | null;
  stablecoinMcap: number | null;
  tvlChange7d?: number | null;
  tvlSpark?: number[];
}

export interface RHProtocol {
  slug: string;
  name: string;
  token: string | null;
  note?: string;
  category?: string | null;
  tvl?: number | null;
  staking?: number | null;
  borrowed?: number | null;
  holdings?: number | null;
  utilisation?: number | null;
  tvlChange7d?: number | null;
  fees24h?: number | null;
  fees7d?: number | null;
  fees30d?: number | null;
  revenue24h?: number | null;
  revenue30d?: number | null;
  url?: string;
}

export interface RHPayload {
  updatedAt: string;
  chain: RHChain;
  tokens: RHToken[];
  protocols: RHProtocol[];
  coverage: { priced: number; total: number; historySamples: number; socialPolled: number };
  /** Fields patched from the previous payload after a partial upstream failure. */
  carriedFields?: number;
  stale?: boolean;
}

/** `force` bypasses the endpoint's 120s cache — used by the manual refresh. */
export async function fetchRobinhoodWatchlist(force = false): Promise<RHPayload | null> {
  try {
    const res = await fetch(`/api/robinhood-watchlist${force ? '?refresh=1' : ''}`);
    if (!res.ok) {
      console.error(`[RH] watchlist HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.tokens)) return null;
    return data as RHPayload;
  } catch (e) {
    console.error('[RH] watchlist fetch failed:', e);
    return null;
  }
}

// ── formatting helpers, shared by every RH panel ───────────────────────────

export function fmtUsd(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (opts.compact === false) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

export function fmtPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(3)}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** Percentages that are levels, not deltas: "30.13% burned", never "+30.13%". */
export function fmtPctPlain(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function fmtCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

/** Render a resolved metric using the kind the server assigned it. */
export function fmtMetric(metric: RHMetric | null | undefined): string {
  if (!metric || metric.value == null) return '—';
  switch (metric.kind) {
    case 'usd': return fmtUsd(metric.value);
    case 'pct': return fmtPctPlain(metric.value, 2);
    case 'count': return fmtCount(metric.value);
    case 'usdPerToken': return fmtPrice(metric.value);
    default: return String(metric.value);
  }
}

export function changeClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'rh-flat';
  if (value > 0) return 'rh-up';
  if (value < 0) return 'rh-down';
  return 'rh-flat';
}

/** Inline sparkline. Returns '' when there aren't enough points to mean anything. */
export function sparkline(values: number[], width = 64, height = 18): string {
  if (!values || values.length < 3) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ');
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const rising = last >= first;
  return `<svg class="rh-spark ${rising ? 'rh-spark-up' : 'rh-spark-down'}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.25" /></svg>`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
