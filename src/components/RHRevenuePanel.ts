import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { fmtUsd, type RHProtocol, type RHToken } from '@/services/robinhood';

/**
 * Which apps on the chain actually earn, and how much of what they charge they keep.
 * Revenue/fees capture is the column that separates a real business from volume.
 */
export class RHRevenuePanel extends Panel {
  private onSelect: ((symbol: string) => void) | null = null;
  private marketCaps: Record<string, number> = {};
  private protocols: RHProtocol[] = [];
  /** Chain-native projects by default; infrastructure is a different question. */
  private nativeOnly = true;

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
        'DefiLlama fees and revenue earned on Robinhood Chain. "Capture" is revenue as a ' +
        'share of fees: what the protocol keeps versus what it passes to LPs. Versions are ' +
        'rolled up, so Pons is V1 and V2 combined. NATIVE shows projects built for this ' +
        'chain; ALL adds deployments like Uniswap that earn here but run on dozens of chains.',
    });
  }

  public renderProtocols(protocols: RHProtocol[]): void {
    if (!protocols || protocols.length === 0) {
      this.showError('No protocol data');
      return;
    }
    this.protocols = protocols;

    const visible = this.nativeOnly
      ? protocols.filter(p => p.native || p.token)
      : protocols;
    const ranked = [...visible].sort(
      (a, b) => (b.fees24h ?? -1) - (a.fees24h ?? -1)
    );

    const rows = ranked.map(p => {
      const capture =
        p.fees24h && p.revenue24h != null && p.fees24h > 0 ? (p.revenue24h / p.fees24h) * 100 : null;
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
            ${p.token
              ? `<span class="rh-tag rh-tag-watched" title="On your watchlist">${escapeHtml(p.token)}</span>`
              : p.symbol
                ? `<span class="rh-tag rh-tag-muted">${escapeHtml(p.symbol)}</span>`
                : ''}
            ${!this.nativeOnly && !p.native && p.chainCount && p.chainCount > 1
              ? `<span class="rh-chains" title="Deployed on ${p.chainCount} chains">${p.chainCount}ch</span>`
              : ''}
          </td>
          <td class="rh-num">${fmtUsd(p.fees24h)}</td>
          <td class="rh-num">${fmtUsd(p.revenue24h)}</td>
          <td class="rh-num ${capture != null && capture >= 50 ? 'rh-up' : ''}">${capture != null ? `${capture.toFixed(0)}%` : '—'}</td>
          <td class="rh-num ${multiple != null && multiple < 10 ? 'rh-up' : ''}">${multiple != null ? `${multiple.toFixed(1)}x` : '—'}</td>
        </tr>
      `;
    }).join('');

    this.setHeaderBadge(`
      <span class="rh-filter">
        <button class="rh-filter-btn ${this.nativeOnly ? 'active' : ''}" data-native="1">NATIVE</button>
        <button class="rh-filter-btn ${this.nativeOnly ? '' : 'active'}" data-native="0">ALL</button>
      </span>
    `);

    this.setContent(`
      <div class="rh-table-wrap">
        <table class="rh-table">
          <thead>
            <tr>
              <th class="rh-th-left">Protocol</th>
              <th class="rh-num">Fees 24h</th>
              <th class="rh-num">Rev 24h</th>
              <th class="rh-num" title="Revenue as a share of fees — what the protocol keeps">Capture</th>
              <th class="rh-num" title="Market cap divided by annualised revenue">Mcap/rev</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);

    this.headerRight.querySelectorAll<HTMLElement>('.rh-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.native === '1';
        if (next === this.nativeOnly) return;
        this.nativeOnly = next;
        this.renderProtocols(this.protocols);
      });
    });

    this.content.querySelectorAll<HTMLElement>('.rh-clickable').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        const symbol = row.dataset.symbol;
        if (symbol) this.onSelect?.(symbol);
      });
    });
  }
}
