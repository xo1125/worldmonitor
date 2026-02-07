import { Panel } from './Panel';
import type { WatchlistData } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

function formatCompact(value: number | undefined): string {
  if (value === undefined || value === 0) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

type SortKey = 'price' | 'change' | 'marketCap' | 'symbol';
type SortDir = 'asc' | 'desc';

export class WatchlistPanel extends Panel {
  private sortKey: SortKey = 'change';
  private sortDir: SortDir = 'desc';
  private lastData: WatchlistData[] = [];

  constructor() {
    super({ id: 'watchlist', title: 'Watchlist' });
  }

  private sortData(data: WatchlistData[]): WatchlistData[] {
    const sorted = [...data];
    const dir = this.sortDir === 'desc' ? -1 : 1;

    sorted.sort((a, b) => {
      switch (this.sortKey) {
        case 'price': return (a.price - b.price) * dir;
        case 'change': return (a.change - b.change) * dir;
        case 'marketCap': return ((a.marketCap ?? 0) - (b.marketCap ?? 0)) * dir;
        case 'symbol': return a.symbol.localeCompare(b.symbol) * dir;
        default: return 0;
      }
    });

    return sorted;
  }

  private renderRow(coin: WatchlistData): string {
    const changeClass = coin.change > 0 ? 'change-up' : coin.change < 0 ? 'change-down' : 'change-flat';
    const changePrefix = coin.change > 0 ? '+' : '';
    const priceStr = coin.price >= 1
      ? `$${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : coin.price > 0 ? `$${coin.price.toFixed(6)}` : '—';

    return `
      <div class="watchlist-row">
        <div class="watchlist-symbol">${escapeHtml(coin.symbol)}</div>
        <div class="watchlist-price">${priceStr}</div>
        <div class="watchlist-mcap">${formatCompact(coin.marketCap)}</div>
        <div class="watchlist-change ${changeClass}">${changePrefix}${coin.change.toFixed(2)}%</div>
        <div class="watchlist-sector"><span class="sector-pill">${escapeHtml(coin.sector ?? '')}</span></div>
      </div>
    `;
  }

  private sortIndicator(key: SortKey): string {
    if (this.sortKey !== key) return '';
    return this.sortDir === 'desc' ? ' ▾' : ' ▴';
  }

  private renderSection(label: string, data: WatchlistData[]): string {
    if (data.length === 0) return '';

    const sorted = this.sortData(data);
    const rows = sorted.map(coin => this.renderRow(coin)).join('');

    return `
      <div class="watchlist-section-label">${label}</div>
      ${rows}
    `;
  }

  public renderWatchlist(data: WatchlistData[]): void {
    if (data.length === 0) {
      this.showError('Failed to load watchlist data');
      return;
    }

    this.lastData = data;
    const high = data.filter(d => d.conviction === 'high');
    const low = data.filter(d => d.conviction === 'low');

    const html = `
      <div class="watchlist-container">
        <div class="watchlist-header-row">
          <span class="wl-sort" data-sort="symbol">Token${this.sortIndicator('symbol')}</span>
          <span class="wl-sort" data-sort="price">Price${this.sortIndicator('price')}</span>
          <span class="wl-sort" data-sort="marketCap">MCap${this.sortIndicator('marketCap')}</span>
          <span class="wl-sort" data-sort="change">24h${this.sortIndicator('change')}</span>
          <span>Sector</span>
        </div>
        ${this.renderSection('HIGH CONVICTION', high)}
        ${this.renderSection('LOW CONVICTION', low)}
      </div>
    `;

    this.setContent(html);

    // Attach sort handlers
    this.content.querySelectorAll('.wl-sort').forEach(el => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.sort as SortKey;
        if (this.sortKey === key) {
          this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortKey = key;
          this.sortDir = 'desc';
        }
        this.renderWatchlist(this.lastData);
      });
    });
  }
}
