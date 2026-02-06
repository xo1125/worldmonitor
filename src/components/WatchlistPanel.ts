import { Panel } from './Panel';
import type { WatchlistData } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export class WatchlistPanel extends Panel {
  constructor() {
    super({ id: 'watchlist', title: 'Watchlist' });
  }

  public renderWatchlist(data: WatchlistData[]): void {
    if (data.length === 0) {
      this.showError('Failed to load watchlist data');
      return;
    }

    const rows = data
      .map((coin) => {
        const changeClass = coin.change > 0 ? 'change-up' : coin.change < 0 ? 'change-down' : 'change-flat';
        const changePrefix = coin.change > 0 ? '+' : '';
        const priceStr = coin.price >= 1
          ? `$${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `$${coin.price.toFixed(6)}`;

        return `
          <div class="watchlist-row">
            <div class="watchlist-symbol">${escapeHtml(coin.symbol)}</div>
            <div class="watchlist-name">${escapeHtml(coin.name)}</div>
            <div class="watchlist-price">${priceStr}</div>
            <div class="watchlist-change ${changeClass}">${changePrefix}${coin.change.toFixed(2)}%</div>
          </div>
        `;
      })
      .join('');

    const html = `
      <div class="watchlist-container">
        <div class="watchlist-header-row">
          <span>Token</span>
          <span></span>
          <span>Price</span>
          <span>24h</span>
        </div>
        ${rows}
      </div>
    `;

    this.setContent(html);
  }
}
