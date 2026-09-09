import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import {
  fmtUsd, fmtPrice, fmtPct, fmtMetric, changeClass, sparkline,
  type RHToken,
} from '@/services/robinhood';

type SortKey = 'symbol' | 'price' | 'change24h' | 'marketCap' | 'liquidity' | 'volume24h' | 'turnover';
type SortDir = 'asc' | 'desc';

/**
 * The watchlist table. Splits high- from low-conviction names and carries the
 * per-token PRIMARY metric — the thing actually worth watching for that project,
 * which differs per token (protocol revenue, backing per token, LP depth, …).
 */
export class RHWatchlistPanel extends Panel {
  private sortKey: SortKey = 'marketCap';
  private sortDir: SortDir = 'desc';
  private tokens: RHToken[] = [];
  private onSelect: ((symbol: string) => void) | null = null;

  public setOnSelect(fn: (symbol: string) => void): void {
    this.onSelect = fn;
  }

  constructor() {
    super({
      id: 'rh-watchlist',
      title: 'RH Watchlist',
      showCount: true,
      infoTooltip:
        'Robinhood Chain watchlist. Price, market cap and liquidity from DexScreener ' +
        '(aggregated across every pair, not just the deepest one). The metric column is ' +
        'the primary fundamental for each project — protocol revenue, treasury backing, ' +
        'borrow utilisation or LP depth, depending on what the project actually does.',
    });
  }

  private sorted(tokens: RHToken[]): RHToken[] {
    const dir = this.sortDir === 'desc' ? -1 : 1;
    const num = (v: number | null) => (v == null || !Number.isFinite(v) ? -Infinity : v);
    return [...tokens].sort((a, b) => {
      if (this.sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      return (num(a[this.sortKey] as number | null) - num(b[this.sortKey] as number | null)) * dir;
    });
  }

  private indicator(key: SortKey): string {
    if (this.sortKey !== key) return '';
    return this.sortDir === 'desc' ? ' ▾' : ' ▴';
  }

  private renderRow(token: RHToken): string {
    const metricValue = fmtMetric(token.primary);
    // A metric we cannot source is stated as such rather than shown as a zero.
    const metricTitle = token.primary.value == null
      ? `${token.primary.label ?? 'Primary metric'}: unavailable${token.primary.note ? ` (${token.primary.note})` : ''}`
      : `${token.primary.label ?? ''} — source: ${token.primary.source}`;

    const spark = sparkline(token.spark);
    const noMarket = token.price == null;

    return `
      <tr class="rh-row ${noMarket ? 'rh-row-nomarket' : ''}" data-symbol="${escapeHtml(token.symbol)}">
        <td class="rh-sym">
          <a href="${escapeHtml(token.chartUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(token.symbol)}</a>
          <span class="rh-project">${escapeHtml(token.project)}</span>
        </td>
        <td class="rh-num">${fmtPrice(token.price)}</td>
        <td class="rh-num ${changeClass(token.change24h)}">${fmtPct(token.change24h)}</td>
        <td class="rh-num">${fmtUsd(token.marketCap)}</td>
        <td class="rh-num">${fmtUsd(token.liquidity)}</td>
        <td class="rh-num">${fmtUsd(token.volume24h)}</td>
        <td class="rh-metric" title="${escapeHtml(metricTitle)}">
          <span class="rh-metric-label">${escapeHtml(token.primary.label ?? '')}</span>
          <span class="rh-metric-value ${token.primary.value == null ? 'rh-na' : ''}">${escapeHtml(metricValue)}</span>
        </td>
        <td class="rh-spark-cell">${spark}</td>
      </tr>
    `;
  }

  private renderSection(label: string, tokens: RHToken[]): string {
    if (tokens.length === 0) return '';
    return `
      <tr class="rh-section"><td colspan="8">${escapeHtml(label)} · ${tokens.length}</td></tr>
      ${this.sorted(tokens).map(t => this.renderRow(t)).join('')}
    `;
  }

  public renderTokens(tokens: RHToken[]): void {
    if (!tokens || tokens.length === 0) {
      this.showError('No Robinhood Chain data');
      return;
    }
    this.tokens = tokens;
    this.setCount(tokens.length);

    const head = (key: SortKey, label: string, cls = 'rh-num') =>
      `<th class="${cls} rh-sortable" data-sort="${key}">${label}${this.indicator(key)}</th>`;

    const html = `
      <div class="rh-table-wrap">
        <table class="rh-table">
          <thead>
            <tr>
              ${head('symbol', 'Token', 'rh-th-left')}
              ${head('price', 'Price')}
              ${head('change24h', '24h')}
              ${head('marketCap', 'MCap')}
              ${head('liquidity', 'Liq')}
              ${head('volume24h', 'Vol 24h')}
              <th class="rh-th-left">Primary metric</th>
              <th class="rh-th-left">48h</th>
            </tr>
          </thead>
          <tbody>
            ${this.renderSection('HIGH CONVICTION', tokens.filter(t => t.conviction === 'high'))}
            ${this.renderSection('LOW CONVICTION', tokens.filter(t => t.conviction === 'low'))}
          </tbody>
        </table>
      </div>
    `;
    this.setContent(html);

    // Row click opens the drill-down; the symbol link still goes to the chart.
    this.content.querySelectorAll<HTMLElement>('.rh-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        const symbol = row.dataset.symbol;
        if (symbol) this.onSelect?.(symbol);
      });
    });

    this.content.querySelectorAll('.rh-sortable').forEach(el => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.sort as SortKey;
        if (this.sortKey === key) {
          this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortKey = key;
          this.sortDir = key === 'symbol' ? 'asc' : 'desc';
        }
        this.renderTokens(this.tokens);
      });
    });
  }
}
