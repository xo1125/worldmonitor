import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { fmtUsd, fmtPct, changeClass, type RHProtocol } from '@/services/robinhood';

/**
 * Which apps on the chain actually earn, and how much of what they charge they keep.
 * Revenue/fees capture is the column that separates a real business from volume.
 */
export class RHRevenuePanel extends Panel {
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
      return `
        <tr>
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
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  }
}
