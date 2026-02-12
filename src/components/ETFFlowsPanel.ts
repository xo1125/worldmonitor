import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface ETFData {
  ticker: string;
  issuer: string;
  dailyNetInflow: number | null;
  flowStatus?: number;
  netAssets: number | null;
  volume: number | null;
  cumNetInflow?: number | null;
  fee?: number | null;
}

interface ETFFlowsResult {
  source: string;
  etfs: ETFData[];
  aggregate: {
    dailyNetInflow: number;
    totalVolume: number;
    totalNetAssets: number;
    cumNetInflow: number;
    etfCount: number;
  };
  lastUpdated: string;
}

export class ETFFlowsPanel extends Panel {
  constructor() {
    super({ id: 'etf-flows', title: 'BTC ETF Tracker' });
  }

  private formatUSD(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`;
    if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
    return `$${abs.toFixed(0)}`;
  }

  private formatFlow(flow: number): string {
    const sign = flow >= 0 ? '+' : '-';
    return `${sign}${this.formatUSD(flow)}`;
  }

  public renderFlows(data: ETFFlowsResult): void {
    if (!data.etfs || data.etfs.length === 0) {
      this.showError('No ETF data available');
      return;
    }

    const isEstimated = data.source !== 'sosovalue';
    const flowClass = data.aggregate.dailyNetInflow >= 0 ? 'etf-positive' : 'etf-negative';

    const rows = data.etfs
      .filter((e) => e.dailyNetInflow !== null)
      .sort((a, b) => Math.abs(b.dailyNetInflow ?? 0) - Math.abs(a.dailyNetInflow ?? 0))
      .map((etf) => {
        const flow = etf.dailyNetInflow ?? 0;
        const etfFlowClass = flow >= 0 ? 'etf-positive' : 'etf-negative';
        const flowStr = this.formatFlow(flow);
        const aum = etf.netAssets ? this.formatUSD(etf.netAssets) : '--';

        return `
          <tr class="etf-row">
            <td class="etf-ticker">${escapeHtml(etf.ticker)}</td>
            <td class="etf-issuer">${escapeHtml(etf.issuer)}</td>
            <td class="etf-flow ${etfFlowClass}">${flowStr}</td>
            <td class="etf-vol">${aum}</td>
          </tr>
        `;
      })
      .join('');

    const updatedTime = data.lastUpdated
      ? new Date(data.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const sourceLabel = isEstimated ? 'Est. ' : '';
    const sourceTag = isEstimated
      ? '<span class="etf-source-tag">estimated</span>'
      : '<span class="etf-source-tag sosovalue">SoSoValue</span>';

    const html = `
      <div class="etf-flows-container">
        <div class="etf-aggregate">
          <div class="etf-agg-item">
            <span class="etf-agg-label">${sourceLabel}Daily Net Flow</span>
            <span class="etf-agg-value ${flowClass}">${this.formatFlow(data.aggregate.dailyNetInflow)}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">Total AUM</span>
            <span class="etf-agg-value">${data.aggregate.totalNetAssets ? this.formatUSD(data.aggregate.totalNetAssets) : '--'}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">Volume</span>
            <span class="etf-agg-value">${data.aggregate.totalVolume ? this.formatUSD(data.aggregate.totalVolume) : '--'}</span>
          </div>
        </div>
        <table class="etf-table">
          <thead>
            <tr>
              <th>ETF</th>
              <th>Issuer</th>
              <th>${sourceLabel}Flow</th>
              <th>AUM</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="etf-updated">Updated ${updatedTime} ${sourceTag}</div>
      </div>
    `;

    this.setContent(html);
  }
}
