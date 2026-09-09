import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { fmtCount, type RHToken } from '@/services/robinhood';

/**
 * X follower counts, scraped through Apify on a 12-hour cron.
 * For the pure memes on this list, attention IS the fundamental.
 */
export class RHSocialPanel extends Panel {
  constructor() {
    super({
      id: 'rh-social',
      title: 'Attention (X)',
      infoTooltip:
        'X follower counts collected through an Apify actor every 12 hours, with the ' +
        'change measured against our own snapshot history. Blank until the first ' +
        'actor run completes.',
    });
  }

  public renderSocial(tokens: RHToken[]): void {
    const seen = new Set<string>();
    const rows = tokens
      .filter(t => t.handle && t.followers != null)
      .filter(t => {
        const key = t.handle!.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));

    if (rows.length === 0) {
      this.setContent(`
        <div class="rh-empty">
          <div class="rh-empty-title">No follower data yet</div>
          <div class="rh-empty-body">
            Set <code>APIFY_TOKEN</code> in the Vercel project, then hit
            <code>/api/robinhood-x?refresh=1</code> once. The cron keeps it current from there.
          </div>
        </div>
      `);
      return;
    }

    const body = rows.map(t => {
      const delta = t.followersChange7d;
      const deltaClass = delta == null ? 'rh-flat' : delta > 0 ? 'rh-up' : delta < 0 ? 'rh-down' : 'rh-flat';
      return `
        <tr>
          <td class="rh-sym">${escapeHtml(t.symbol)}</td>
          <td class="rh-th-left">
            <a href="https://x.com/${encodeURIComponent(t.handle!)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(t.handle!)}</a>
          </td>
          <td class="rh-num">${fmtCount(t.followers)}</td>
          <td class="rh-num ${deltaClass}">${delta != null ? `${delta > 0 ? '+' : ''}${fmtCount(delta)}` : '—'}</td>
        </tr>
      `;
    }).join('');

    this.setContent(`
      <div class="rh-table-wrap">
        <table class="rh-table">
          <thead><tr>
            <th class="rh-th-left">Token</th><th class="rh-th-left">Account</th>
            <th class="rh-num">Followers</th><th class="rh-num">7d</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `);
  }
}
