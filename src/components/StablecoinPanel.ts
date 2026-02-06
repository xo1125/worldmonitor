import { Panel } from './Panel';
import type { StablecoinData } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export class StablecoinPanel extends Panel {
  constructor() {
    super({ id: 'stablecoins', title: 'Stablecoins' });
  }

  public renderStablecoins(data: StablecoinData[]): void {
    if (data.length === 0) {
      this.showError('Failed to load stablecoin data');
      return;
    }

    const html =
      '<div class="stablecoin-grid">' +
      data
        .map((coin) => {
          const pegDev = Math.abs(coin.price - 1.0);
          const pegClass = pegDev <= 0.005 ? 'peg-stable' : pegDev <= 0.01 ? 'peg-warning' : 'peg-danger';
          const pegLabel = pegDev <= 0.005 ? 'ON PEG' : pegDev <= 0.01 ? 'SLIGHT DEPEG' : 'DEPEGGED';
          const mcapStr = coin.marketCap >= 1e9
            ? `$${(coin.marketCap / 1e9).toFixed(1)}B`
            : `$${(coin.marketCap / 1e6).toFixed(0)}M`;

          return `
          <div class="stablecoin-item">
            <div class="stablecoin-symbol">${escapeHtml(coin.symbol)}</div>
            <div class="stablecoin-price">$${coin.price.toFixed(4)}</div>
            <div class="stablecoin-mcap">MCap: ${mcapStr}</div>
            <div class="peg-status ${pegClass}">${pegLabel}</div>
          </div>
        `;
        })
        .join('') +
      '</div>';

    this.setContent(html);
  }
}
