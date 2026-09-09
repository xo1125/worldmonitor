import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { fmtUsd, fmtPct, changeClass, type RHProtocol, type RHToken } from '@/services/robinhood';

/**
 * Which apps on the chain actually earn, and how much of what they charge they keep.
 * Revenue/fees capture is the column that separates a real business from volume.
 */
export class RHRevenuePanel extends Panel {
  private onSelect: ((symbol: string) => void) | null = null;
  private marketCaps: Record<string, number> = {};

  public setOnSelect(fn: (symbol: string) => void): void {
    this.onSelect = fn;
  }

  /** Market caps let the panel price revenue rather than just report it. */
  public setTokens(tokens: RHToken[]): void {
    this.marketCaps = {};
    for (const t of tokens) if (t.marketCap) this.marketCaps[t.symbol] = t.marketCap;
  }

  constructor() {
    super({
      id: 'rh-revenue',
      title: 'Revenue Leaders',
      infoTooltip:
        'DefiLlama fees and revenue for Robinhood Chain apps. "Capture" is revenue as a ' +
        'share of fees: what the protocol keeps versus what it passes to LPs. Protocols ' +
        'without a fee adapter show as —.',
    });
  }

  public renderProtocols(protocols: RHProtocol[]): void {
    if (!protocols || protocols.length === 0) {
      this.showError('No protocol data');
      return;
    }

    const ranked = [...protocols].sort(
      (a, b) => (b.fees24h ?? -1) - (a.fees24h ?? -1)
    );

    const rows = ranked.map(p => {
      const capture =
        p.fees24h && p.revenue24h != null && p.fees24h > 0 ? (p.revenue24h / p.fees24h) * 100 : null;
      const holdings = p.holdings ?? p.tvl ?? null;
      // 30d is the only honest annualisation basis: these protocols are weeks old.
      const annualRevenue = p.revenue30d != null ? p.revenue30d * 12.17 : null;
      const mcap = p.token ? this.marketCaps[p.token] : undefined;
      const multiple = mcap && annualRevenue ? mcap / annualRevenue : null;
      return `
        <tr class="${p.token ? 'rh-clickable' : ''}" data-symbol="${escapeHtml(p.token || '')}">
          <td class="rh-th-left">
            ${p.url
              ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)}</a>`
              : escapeHtml(p.name)}
            ${p.token ? `<span class="rh-tag">${escapeHtml(p.token)}</span>` : '<span class="rh-tag rh-tag-muted">no token</span>'}
          </td>
          <td class="rh-num">${fmtUsd(holdings)}</td>
          <td class="rh-num ${changeClass(p.tvlChange7d)}">${fmtPct(p.tvlChange7d)}</td>
          <td class="rh-num">${fmtUsd(p.fees24h)}</td>
          <td class="rh-num">${fmtUsd(p.revenue24h)}</td>
          <td class="rh-num ${capture != null && capture >= 50 ? 'rh-up' : ''}">${capture != null ? `${capture.toFixed(0)}%` : '—'}</td>
          <td class="rh-num">${fmtUsd(annualRevenue)}</td>
          <td class="rh-num ${multiple != null && multiple < 10 ? 'rh-up' : ''}">${multiple != null ? `${multiple.toFixed(1)}x` : '—'}</td>
        </tr>
      `;
    }).join('');

    this.setContent(`
      <div class="rh-table-wrap">
        <table class="rh-table">
          <thead>
            <tr>
              <th class="rh-th-left">Protocol</th>
              <th class="rh-num">TVL</th>
              <th class="rh-num">7d</th>
              <th class="rh-num">Fees 24h</th>
              <th class="rh-num">Rev 24h</th>
              <th class="rh-num">Capture</th>
              <th class="rh-num">Ann. rev</th>
              <th class="rh-num" title="Market cap divided by annualised revenue">Mcap/rev</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);

    this.content.querySelectorAll<HTMLElement>('.rh-clickable').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        const symbol = row.dataset.symbol;
        if (symbol) this.onSelect?.(symbol);
      });
    });
  }
}
