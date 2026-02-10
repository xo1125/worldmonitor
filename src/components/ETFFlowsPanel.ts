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

    const rows = validEtfs
      .map((etf) => {
        const dollarVol = (etf.volume ?? 0) * (etf.price ?? 0);
        const changePct = etf.change ?? 0;
        const direction = changePct >= 0 ? 1 : -1;
        const weight = Math.min(Math.abs(changePct) / 100, 0.5);
        const estFlow = dollarVol * Math.max(weight, 0.02) * direction;
        const flowStr = dollarVol > 0 ? this.formatFlow(estFlow) : '--';
        const etfFlowClass = estFlow >= 0 ? 'etf-positive' : 'etf-negative';
        const volStr = dollarVol > 0 ? this.formatVolume(dollarVol) : '--';

        return `
          <tr class="etf-row">
            <td class="etf-ticker">${escapeHtml(etf.ticker)}</td>
            <td class="etf-issuer">${escapeHtml(etf.issuer)}</td>
            <td class="etf-flow ${etfFlowClass}">${flowStr}</td>
            <td class="etf-vol">${volStr}</td>
          </tr>
        `;
      })
      .join('');

    const updatedTime = data.lastUpdated
      ? new Date(data.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const html = `
      <div class="etf-flows-container">
        <div class="etf-aggregate">
          <div class="etf-agg-item">
            <span class="etf-agg-label">Est. Net Flow</span>
            <span class="etf-agg-value ${flowClass}">${this.formatFlow(data.aggregate.estimatedNetFlow)}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">Total Volume</span>
            <span class="etf-agg-value">${this.formatVolume(data.aggregate.totalVolume)}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">ETFs Tracked</span>
            <span class="etf-agg-value">${data.aggregate.etfCount}</span>
          </div>
        </div>
        <table class="etf-table">
          <thead>
            <tr>
              <th>ETF</th>
              <th>Issuer</th>
              <th>Est. Flow</th>
              <th>Vol</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="etf-updated">Updated ${updatedTime}</div>
      </div>
    `;

    this.setContent(html);
  }
}
