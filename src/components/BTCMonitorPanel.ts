import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

// Upcoming BTC options expiry dates (major monthly expiries)
const OPEX_DATES = [
  { date: '2026-02-20', label: 'Feb Monthly Opex' },
  { date: '2026-03-27', label: 'Mar Quarterly Opex' },
  { date: '2026-04-24', label: 'Apr Monthly Opex' },
];

interface BTCLevel {
  value: number;
  source: 'api' | 'fallback' | 'computed' | 'derived';
  label: string;
  tag: string;
}

interface BTCLevelsData {
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

const REGIME_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  BULL: {
    label: 'EXPANSION',
    color: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.12)',
    description: 'Price above STH cost basis — market in expansion mode',
  },
  DEFENSIVE: {
    label: 'DEFENSIVE',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    description: 'Price between True Mean and STH cost basis — overhead resistance zone',
  },
  BEAR: {
    label: 'STRUCTURAL WEAKNESS',
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.12)',
    description: 'Price below True Market Mean — risk of further downside',
  },
  FLOOR_TEST: {
    label: 'FLOOR TEST',
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.12)',
    description: 'Price near 200-Week MA — historical bottom territory',
  },
};

export class BTCMonitorPanel extends Panel {
  constructor() {
    super({
      id: 'btc-monitor',
      title: 'BTC Monitor',
      infoTooltip: 'Tracks BTC price relative to key on-chain and technical levels. Regime is determined by position relative to STH Cost Basis, True Market Mean, 200-Week MA, and Realized Price.',
    });
  }

  private formatPrice(value: number): string {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  private renderRegimeBanner(data: BTCLevelsData): string {
    const fallback = { label: 'UNKNOWN', color: '#888', bg: 'rgba(136,136,136,0.12)', description: 'Unable to determine regime' };
    const cfg = REGIME_CONFIG[data.regime] ?? fallback;
    const { color, bg, label, description } = cfg;

    return `
      <div class="btc-regime-banner" style="background: ${bg}; border-color: ${color}">
        <div class="btc-regime-top">
          <span class="btc-regime-label" style="color: ${color}">${label}</span>
          ${data.dead_cat_warning ? '<span class="btc-dead-cat-badge">TRAP ZONE</span>' : ''}
        </div>
        <div class="btc-regime-price">${this.formatPrice(data.price)}</div>
        <div class="btc-regime-desc">${description}</div>
      </div>
    `;
  }

  private renderRiskGauge(score: number): string {
    // Semicircle SVG gauge — 0 (safe) to 100 (floor)
    const radius = 50;
    const stroke = 8;
    const cx = 60;
    const cy = 58;
    const circumference = Math.PI * radius; // semicircle
    const arcLength = (score / 100) * circumference;

    // Color: 0=green, 50=yellow, 100=red
    let color: string;
    if (score <= 30) color = '#4ade80';
    else if (score <= 60) color = '#fbbf24';
    else if (score <= 80) color = '#fb923c';
    else color = '#f87171';

    let riskLabel: string;
    if (score <= 25) riskLabel = 'Low Risk';
    else if (score <= 50) riskLabel = 'Moderate';
    else if (score <= 75) riskLabel = 'Elevated';
    else riskLabel = 'Critical';

    return `
      <div class="btc-gauge-section">
        <div class="btc-gauge-title">Floor Proximity</div>
        <svg class="btc-risk-gauge" viewBox="0 0 120 68">
          <path d="M 10 58 A ${radius} ${radius} 0 0 1 110 58"
            fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${stroke}" stroke-linecap="round"/>
          <path d="M 10 58 A ${radius} ${radius} 0 0 1 110 58"
            fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
            stroke-dasharray="${arcLength} ${circumference}"
            style="transition: stroke-dasharray 0.6s ease"/>
          <text x="${cx}" y="${cy - 8}" text-anchor="middle" dominant-baseline="middle"
            fill="${color}" font-size="20" font-weight="700" font-family="'JetBrains Mono', monospace">${score}</text>
          <text x="${cx}" y="${cy + 8}" text-anchor="middle" dominant-baseline="middle"
            fill="rgba(255,255,255,0.5)" font-size="8" font-weight="500">${riskLabel}</text>
        </svg>
      </div>
    `;
  }

  private renderRetestBar(data: BTCLevelsData): string {
    const wma = data.levels.wma_200.value;
    const sthRp = data.levels.sth_rp.value;
    const range = sthRp - wma;
    if (range <= 0) return '';

    const pricePos = Math.max(0, Math.min(100, ((data.price - wma) / range) * 100));
    const trueMeanPos = Math.max(0, Math.min(100, ((data.levels.true_mean.value - wma) / range) * 100));

    // Trap zone: last 10% near STH-RP
    const trapStart = 85;

    return `
      <div class="btc-retest-section">
        <div class="btc-retest-title">Price Position</div>
        <div class="btc-retest-labels">
          <span class="btc-retest-label-left">${this.formatPrice(wma)}</span>
          <span class="btc-retest-label-right">${this.formatPrice(sthRp)}</span>
        </div>
        <div class="btc-retest-bar">
          <div class="btc-retest-track">
            <div class="btc-retest-trap" style="left: ${trapStart}%; width: ${100 - trapStart}%"></div>
            <div class="btc-retest-mean-line" style="left: ${trueMeanPos}%"></div>
            <div class="btc-retest-dot" style="left: ${pricePos}%"></div>
          </div>
        </div>
        <div class="btc-retest-sublabels">
          <span>200WMA</span>
          <span style="position:absolute; left: ${trueMeanPos}%; transform: translateX(-50%)">Mean</span>
          <span>STH-RP</span>
        </div>
      </div>
    `;
  }

  private renderDeadCatWarning(): string {
    return `
      <div class="btc-dead-cat-warning">
        <span class="btc-warning-icon">!</span>
        <span>Dead Cat Bounce Risk — Price near STH cost basis rejection zone. Watch for failure to hold above $90K.</span>
      </div>
    `;
  }

  private renderOpexBanner(): string {
    const now = new Date();
    const upcoming = OPEX_DATES
      .map(o => ({ ...o, dt: new Date(o.date + 'T08:00:00Z') }))
      .filter(o => o.dt > now)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];

    if (!upcoming) return '';

    const daysUntil = Math.ceil((upcoming.dt.getTime() - now.getTime()) / 86400000);
    const isUrgent = daysUntil <= 3;
    const urgentClass = isUrgent ? 'btc-opex-urgent' : '';

    return `
      <div class="btc-opex-banner ${urgentClass}">
        <span class="btc-opex-label">OPTIONS EXPIRY</span>
        <span class="btc-opex-date">${upcoming.label}</span>
        <span class="btc-opex-countdown">${daysUntil}d</span>
      </div>
    `;
  }

  private renderLevelsTable(data: BTCLevelsData): string {
    const levels = [
      data.levels.sth_rp,
      data.levels.true_mean,
      data.levels.wma_200,
      data.levels.realized,
    ];

    const rows = levels.map(level => {
      const distance = ((data.price - level.value) / level.value) * 100;
      const isAbove = data.price >= level.value;
      const distClass = isAbove ? 'btc-level-above' : 'btc-level-below';
      const distStr = `${isAbove ? '+' : ''}${distance.toFixed(1)}%`;
      const sourceTag = level.source === 'api' || level.source === 'computed' ? 'live' : level.source;

      return `
        <tr class="btc-level-row">
          <td class="btc-level-name">
            <span class="btc-level-label">${escapeHtml(level.label)}</span>
            <span class="btc-level-tag">${escapeHtml(level.tag)}</span>
          </td>
          <td class="btc-level-value">${this.formatPrice(level.value)}</td>
          <td class="btc-level-dist ${distClass}">${distStr}</td>
          <td class="btc-level-source">${sourceTag}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="btc-levels-section">
        <table class="btc-levels-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Value</th>
              <th>Distance</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private renderSparklineWithLevels(data: BTCLevelsData): string {
    const prices = data.price_history_30d;
    if (!prices || prices.length < 2) return '';

    const allValues = [
      ...prices,
      data.levels.sth_rp.value,
      data.levels.true_mean.value,
      data.levels.wma_200.value,
      data.levels.realized.value,
    ];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    const width = 400;
    const height = 60;
    const pad = 2;
    const usableHeight = height - pad * 2;

    const toY = (val: number) => pad + usableHeight - ((val - min) / range) * usableHeight;

    const points = prices.map((val, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = toY(val);
      return `${x},${y}`;
    }).join(' ');

    const last = prices[prices.length - 1] ?? 0;
    const first = prices[0] ?? 0;
    const lineColor = last >= first ? '#4ade80' : '#f87171';

    const levelLines = [
      { val: data.levels.sth_rp.value, color: '#f87171', dash: '4,3' },
      { val: data.levels.true_mean.value, color: '#fbbf24', dash: '4,3' },
      { val: data.levels.wma_200.value, color: '#c084fc', dash: '4,3' },
    ].filter(l => l.val >= min && l.val <= max).map(l => {
      const y = toY(l.val);
      return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${l.color}" stroke-width="0.8" stroke-dasharray="${l.dash}" opacity="0.5"/>`;
    }).join('');

    return `
      <div class="btc-sparkline-section">
        <svg class="btc-level-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          ${levelLines}
          <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="btc-sparkline-label">30-day price with key levels</div>
      </div>
    `;
  }

  public renderLevels(data: BTCLevelsData): void {
    const html = `
      <div class="btc-monitor-container">
        ${this.renderOpexBanner()}
        ${this.renderRegimeBanner(data)}
        <div class="btc-gauges-row">
          ${this.renderRiskGauge(data.risk_score)}
          ${this.renderRetestBar(data)}
        </div>
        ${data.dead_cat_warning ? this.renderDeadCatWarning() : ''}
        ${this.renderLevelsTable(data)}
        ${this.renderSparklineWithLevels(data)}
      </div>
    `;

    this.setContent(html);
  }
}
