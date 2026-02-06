import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface ETFData {
  ticker: string;
  name: string;
  issuer: string;
  price: number | null;
  change: number | null;
  volume: number | null;
}

interface ETFFlowsResult {
  etfs: ETFData[];
  aggregate: {
    totalVolume: number;
    avgChange: number;
    estimatedNetFlow: number;
    etfCount: number;
  };
  lastUpdated: string;
}

export class ETFFlowsPanel extends Panel {
  constructor() {
    super({ id: 'etf-flows', title: 'BTC ETF Tracker' });
  }

  private formatVolume(vol: number): string {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(0)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
    return `$${vol}`;
  }

  private formatFlow(flow: number): string {
    const abs = Math.abs(flow);
    const sign = flow >= 0 ? '+' : '-';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
    return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  }

  public renderFlows(data: ETFFlowsResult): void {
    if (!data.etfs || data.etfs.length === 0) {
      this.showError('No ETF data available');
      return;
    }

    const validEtfs = data.etfs.filter((e) => e.price !== null);

    const flowClass = data.aggregate.estimatedNetFlow >= 0 ? 'etf-inflow' : 'etf-outflow';
    const changeClass = data.aggregate.avgChange >= 0 ? 'etf-positive' : 'etf-negative';

    const rows = validEtfs
      .map((etf) => {
        const chgClass = (etf.change ?? 0) >= 0 ? 'etf-positive' : 'etf-negative';
        const chgStr = etf.change != null ? `${etf.change >= 0 ? '+' : ''}${etf.change.toFixed(2)}%` : '--';
        const priceStr = etf.price != null ? `$${etf.price.toFixed(2)}` : '--';
        const volStr = etf.volume != null ? this.formatVolume(etf.volume * (etf.price || 0)) : '--';

        return `
          <tr class="etf-row">
            <td class="etf-ticker">${escapeHtml(etf.ticker)}</td>
            <td class="etf-issuer">${escapeHtml(etf.issuer)}</td>
            <td class="etf-price">${priceStr}</td>
            <td class="etf-change ${chgClass}">${chgStr}</td>
            <td class="etf-vol">${volStr}</td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <div class="etf-flows-container">
        <div class="etf-aggregate">
          <div class="etf-agg-item">
            <span class="etf-agg-label">Est. Net Flow</span>
            <span class="etf-agg-value ${flowClass}">${this.formatFlow(data.aggregate.estimatedNetFlow)}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">Avg Change</span>
            <span class="etf-agg-value ${changeClass}">${data.aggregate.avgChange >= 0 ? '+' : ''}${data.aggregate.avgChange.toFixed(2)}%</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">Total Volume</span>
            <span class="etf-agg-value">${this.formatVolume(data.aggregate.totalVolume)}</span>
          </div>
        </div>
        <table class="etf-table">
          <thead>
            <tr>
              <th>ETF</th>
              <th>Issuer</th>
              <th>Price</th>
              <th>24h</th>
              <th>Vol</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    this.setContent(html);
  }
}
