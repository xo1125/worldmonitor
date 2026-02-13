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
  change?: number | null;
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
    super({ id: 'etf-flows', title: 'BTC ETF' });
  }

  private formatUSD(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
    return `$${abs.toFixed(0)}`;
  }

  private formatFlow(flow: number): string {
    const sign = flow >= 0 ? '+' : '-';
    return `${sign}${this.formatUSD(flow)}`;
  }

  private formatVolShort(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
    return `$${abs.toFixed(0)}`;
  }

  public renderFlows(data: ETFFlowsResult): void {
    if (!data.etfs || data.etfs.length === 0) {
      this.showError('No ETF data available');
      return;
    }

    const isEstimated = data.source !== 'sosovalue';
    const netFlow = data.aggregate.dailyNetInflow;
    const flowClass = netFlow >= 0 ? 'etf-positive' : 'etf-negative';
    const netLabel = netFlow >= 0 ? 'NET INFLOW' : 'NET OUTFLOW';

    // 5th column: AUM if SoSoValue, Change if Yahoo fallback
    const fifthColHeader = isEstimated ? 'Change' : 'AUM';

    const rows = data.etfs
      .filter((e) => e.dailyNetInflow !== null)
      .sort((a, b) => Math.abs(b.dailyNetInflow ?? 0) - Math.abs(a.dailyNetInflow ?? 0))
      .map((etf) => {
        const flow = etf.dailyNetInflow ?? 0;
        const etfFlowClass = flow >= 0 ? 'etf-positive' : 'etf-negative';
        const flowStr = this.formatFlow(flow);
        const vol = etf.volume ? this.formatVolShort(etf.volume) : '--';

        let fifthCol: string;
        if (isEstimated) {
          fifthCol = etf.change != null
            ? `<span class="${etf.change >= 0 ? 'etf-positive' : 'etf-negative'}">${etf.change >= 0 ? '+' : ''}${etf.change.toFixed(2)}%</span>`
            : '--';
        } else {
          fifthCol = etf.netAssets ? this.formatUSD(etf.netAssets) : '--';
        }

        return `
          <tr class="etf-row">
            <td class="etf-ticker">${escapeHtml(etf.ticker)}</td>
            <td class="etf-issuer">${escapeHtml(etf.issuer)}</td>
            <td class="etf-flow ${etfFlowClass}">${flowStr}</td>
            <td class="etf-vol">${vol}</td>
            <td class="etf-aum">${fifthCol}</td>
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
            <span class="etf-agg-label">Net Flow</span>
            <span class="etf-net-label ${flowClass}">${netLabel}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">${sourceLabel}Flow</span>
            <span class="etf-agg-value ${flowClass}">${this.formatUSD(Math.abs(netFlow))}</span>
          </div>
          <div class="etf-agg-item">
            <span class="etf-agg-label">Total Vol</span>
            <span class="etf-agg-value">${data.aggregate.totalVolume ? this.formatVolShort(data.aggregate.totalVolume) : '--'}</span>
          </div>
        </div>
        <table class="etf-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Issuer</th>
              <th>${sourceLabel}Flow</th>
              <th>Volume</th>
              <th>${fifthColHeader}</th>
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
