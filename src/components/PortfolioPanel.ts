import { Panel } from './Panel';
import type { PortfolioData } from '@/types';
import type { PortfolioCategory } from '@/config/markets';
import { PORTFOLIO_CATEGORY_ORDER } from '@/config';
import { escapeHtml } from '@/utils/sanitize';

function formatCompact(value: number | undefined): string {
  if (value === undefined || value === 0) return '--';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

type SortKey = 'price' | 'change' | 'marketCap' | 'symbol';
type SortDir = 'asc' | 'desc';

export class PortfolioPanel extends Panel {
  private sortKey: SortKey = 'change';
  private sortDir: SortDir = 'desc';
  private lastData: PortfolioData[] = [];

  constructor() {
    super({ id: 'portfolio', title: 'Portfolio' });
  }

  private sortData(data: PortfolioData[]): PortfolioData[] {
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

  private renderRow(coin: PortfolioData): string {
    const changeClass = coin.change > 0 ? 'pf-up' : coin.change < 0 ? 'pf-down' : 'pf-flat';
    const changePrefix = coin.change > 0 ? '+' : '';
    const priceStr = coin.price >= 1
      ? `$${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : coin.price > 0 ? `$${coin.price.toFixed(6)}` : '--';

    const convictionDot = coin.conviction
      ? `<span class="pf-conviction pf-conv-${coin.conviction}" title="${coin.conviction} conviction"></span>`
      : '';

    return `
      <div class="pf-row">
        <div class="pf-symbol">${convictionDot}${escapeHtml(coin.symbol)}</div>
        <div class="pf-price">${priceStr}</div>
        <div class="pf-mcap">${formatCompact(coin.marketCap)}</div>
        <div class="pf-change ${changeClass}">${changePrefix}${coin.change.toFixed(2)}%</div>
      </div>
    `;
  }

  private sortIndicator(key: SortKey): string {
    if (this.sortKey !== key) return '';
    return this.sortDir === 'desc' ? ' \u25BE' : ' \u25B4';
  }

  private renderCategorySection(category: PortfolioCategory, coins: PortfolioData[]): string {
    if (coins.length === 0) return '';

    const sorted = this.sortData(coins);
    const rows = sorted.map(coin => this.renderRow(coin)).join('');

    // Category avg change
    const avgChange = coins.reduce((s, c) => s + c.change, 0) / coins.length;
    const avgClass = avgChange > 0 ? 'pf-up' : avgChange < 0 ? 'pf-down' : 'pf-flat';
    const avgPrefix = avgChange > 0 ? '+' : '';

    return `
      <div class="pf-category-label">
        <span class="pf-cat-name">${category}</span>
        <span class="pf-cat-avg ${avgClass}">${avgPrefix}${avgChange.toFixed(1)}%</span>
      </div>
      ${rows}
    `;
  }

  public renderPortfolio(data: PortfolioData[]): void {
    if (data.length === 0) {
      this.showError('Failed to load portfolio data');
      return;
    }

    this.lastData = data;

    // Group by category
    const grouped = new Map<PortfolioCategory, PortfolioData[]>();
    for (const coin of data) {
      const list = grouped.get(coin.category) || [];
      list.push(coin);
      grouped.set(coin.category, list);
    }

    // Render in defined order
    const sections = PORTFOLIO_CATEGORY_ORDER
      .filter(cat => grouped.has(cat))
      .map(cat => this.renderCategorySection(cat, grouped.get(cat)!))
      .join('');

    const html = `
      <div class="pf-container">
        <div class="pf-header-row">
          <span class="pf-sort" data-sort="symbol">Token${this.sortIndicator('symbol')}</span>
          <span class="pf-sort" data-sort="price">Price${this.sortIndicator('price')}</span>
          <span class="pf-sort" data-sort="marketCap">MCap${this.sortIndicator('marketCap')}</span>
          <span class="pf-sort" data-sort="change">24h${this.sortIndicator('change')}</span>
        </div>
        ${sections}
      </div>
    `;

    this.setContent(html);

    // Attach sort handlers
    this.content.querySelectorAll('.pf-sort').forEach(el => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.sort as SortKey;
        if (this.sortKey === key) {
          this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortKey = key;
          this.sortDir = 'desc';
        }
        this.renderPortfolio(this.lastData);
      });
    });
  }
}
