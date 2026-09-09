import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { fmtPct, fmtUsd, changeClass, type RHToken } from '@/services/robinhood';

/**
 * Movers plus the two structural tells the watchlist cares about:
 * turnover (24h volume over LP depth) and buy share of trades.
 * High turnover on thin liquidity is churn, not demand.
 */
export class RHMoversPanel extends Panel {
  constructor() {
    super({
      id: 'rh-movers',
      title: 'Movers & Flow',
      infoTooltip:
        'Top 24h movers by price. Turnover is 24h volume divided by aggregate liquidity — ' +
        'above ~3x means the pool is being cycled rather than accumulated. Buy share is ' +
        'buys as a percentage of all trades in the last 24 hours.',
    });
  }

  private row(token: RHToken): string {
    const turnover = token.turnover;
    const turnoverClass = turnover != null && turnover > 3 ? 'rh-warn' : '';
    const buyPct = token.buyRatio != null ? token.buyRatio * 100 : null;

    return `
      <tr>
        <td class="rh-sym">
          <a href="${escapeHtml(token.chartUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(token.symbol)}</a>
        </td>
        <td class="rh-num ${changeClass(token.change24h)}">${fmtPct(token.change24h)}</td>
        <td class="rh-num ${changeClass(token.change6h)}">${fmtPct(token.change6h)}</td>
        <td class="rh-num">${fmtUsd(token.volume24h)}</td>
        <td class="rh-num ${turnoverClass}">${turnover != null ? `${turnover.toFixed(1)}x` : '—'}</td>
        <td class="rh-num ${buyPct != null && buyPct >= 50 ? 'rh-up' : 'rh-down'}">${buyPct != null ? `${buyPct.toFixed(0)}%` : '—'}</td>
      </tr>
    `;
  }

  public renderMovers(tokens: RHToken[]): void {
    const tradeable = tokens.filter(t => t.change24h != null);
    if (tradeable.length === 0) {
      this.showError('No market data');
      return;
    }

    const sorted = [...tradeable].sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
    const gainers = sorted.slice(0, 5);
    const losers = sorted.slice(-5).reverse();

    this.setContent(`
      <div class="rh-table-wrap">
        <table class="rh-table">
          <thead>
            <tr>
              <th class="rh-th-left">Token</th>
              <th class="rh-num">24h</th>
              <th class="rh-num">6h</th>
              <th class="rh-num">Vol</th>
              <th class="rh-num">Turn</th>
              <th class="rh-num">Buy%</th>
            </tr>
          </thead>
          <tbody>
            <tr class="rh-section"><td colspan="6">GAINERS</td></tr>
            ${gainers.map(t => this.row(t)).join('')}
            <tr class="rh-section"><td colspan="6">LAGGARDS</td></tr>
            ${losers.map(t => this.row(t)).join('')}
          </tbody>
        </table>
      </div>
    `);
  }
}
