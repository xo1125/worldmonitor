import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface MoverData {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  change7dPct: number;
  change7dUsd: number;
}

interface ReportData {
  topPctGainers: MoverData[];
  topPctLosers: MoverData[];
  topUsdGainers: MoverData[];
  topUsdLosers: MoverData[];
  mcapTiers: { mega: number; large: number; mid: number; small: number };
  totalCoins: number;
  lastUpdated: string;
}

export class ReportingPanel extends Panel {
  constructor() {
    super({ id: 'reporting', title: 'Weekly Report' });
  }

  private formatUsd(n: number): string {
    const abs = Math.abs(n);
    const sign = n >= 0 ? '+' : '-';
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
    return `${sign}$${abs.toFixed(4)}`;
  }

  private formatPrice(n: number): string {
    if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return `$${n.toFixed(6)}`;
  }

  private renderMoverTable(title: string, data: MoverData[], mode: 'pct' | 'usd'): string {
    const rows = data.map(d => {
      const changeClass = mode === 'pct'
        ? (d.change7dPct >= 0 ? 'rpt-up' : 'rpt-down')
        : (d.change7dUsd >= 0 ? 'rpt-up' : 'rpt-down');
      const changeStr = mode === 'pct'
        ? `${d.change7dPct >= 0 ? '+' : ''}${d.change7dPct.toFixed(1)}%`
        : this.formatUsd(d.change7dUsd);

      return `
        <div class="rpt-mover-row">
          <span class="rpt-mover-symbol">${escapeHtml(d.symbol)}</span>
          <span class="rpt-mover-price">${this.formatPrice(d.price)}</span>
          <span class="rpt-mover-change ${changeClass}">${changeStr}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="rpt-mover-section">
        <div class="rpt-mover-title">${escapeHtml(title)}</div>
        ${rows}
      </div>
    `;
  }

  private renderMcapDistribution(tiers: ReportData['mcapTiers'], total: number): string {
    const items = [
      { label: 'Mega (>$10B)', count: tiers.mega, color: '#4ade80' },
      { label: 'Large ($1B-$10B)', count: tiers.large, color: '#60a5fa' },
      { label: 'Mid ($100M-$1B)', count: tiers.mid, color: '#fbbf24' },
      { label: 'Small (<$100M)', count: tiers.small, color: '#f87171' },
    ];

    const bars = items.map(item => {
      const pct = total > 0 ? (item.count / total) * 100 : 0;
      return `
        <div class="rpt-mcap-row">
          <span class="rpt-mcap-label">${item.label}</span>
          <div class="rpt-mcap-bar-track">
            <div class="rpt-mcap-bar-fill" style="width: ${pct}%; background: ${item.color}"></div>
          </div>
          <span class="rpt-mcap-count">${item.count}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="rpt-mcap-section">
        <div class="rpt-section-title">Market Cap Distribution (Top 100)</div>
        ${bars}
      </div>
    `;
  }

  public renderReport(data: ReportData): void {
    const html = `
      <div class="rpt-container">
        <div class="rpt-movers-grid">
          ${this.renderMoverTable('Top $ Gainers (7d)', data.topUsdGainers, 'usd')}
          ${this.renderMoverTable('Top $ Losers (7d)', data.topUsdLosers, 'usd')}
          ${this.renderMoverTable('Top % Gainers (7d)', data.topPctGainers, 'pct')}
          ${this.renderMoverTable('Top % Losers (7d)', data.topPctLosers, 'pct')}
        </div>
        ${this.renderMcapDistribution(data.mcapTiers, data.totalCoins)}
      </div>
    `;

    this.setContent(html);
  }
}
