import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

export interface TokenCategoryData {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  change7d: number | null;
  marketCap?: number;
  volume?: number;
  conviction?: 'high' | 'low';
}

export class TokenCategoryPanel extends Panel {
  constructor(id: string, title: string) {
    super({ id, title });
  }

  private formatPrice(price: number): string {
    if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price > 0) return `$${price.toFixed(6)}`;
    return '--';
  }

  private formatChange(val: number | null): string {
    if (val == null) return '<span class="tc-na">--</span>';
    const cls = val > 0 ? 'tc-up' : val < 0 ? 'tc-down' : 'tc-flat';
    const prefix = val > 0 ? '+' : '';
    return `<span class="${cls}">${prefix}${val.toFixed(1)}%</span>`;
  }

  public renderTokens(data: TokenCategoryData[]): void {
    if (data.length === 0) {
      this.showError('No token data');
      return;
    }

    const rows = data.map(token => {
      return `
        <tr class="tc-row">
          <td class="tc-token">${escapeHtml(token.symbol)}</td>
          <td class="tc-price">${this.formatPrice(token.price)}</td>
          <td class="tc-chg">${this.formatChange(token.change24h)}</td>
          <td class="tc-chg">${this.formatChange(token.change7d)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="tc-container">
        <table class="tc-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Price</th>
              <th>24h</th>
              <th>7d</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    this.setContent(html);
  }
}
