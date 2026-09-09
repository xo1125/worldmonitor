import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { fmtPctPlain, fmtPrice, fmtCount, changeClass, type RHToken } from '@/services/robinhood';

/**
 * Reads straight off the chain: supply burned, and where a treasury exists,
 * backing per token against the traded price. This is the panel that answers
 * "is the asset-backing claim real, and is it priced in".
 */
export class RHOnchainPanel extends Panel {
  constructor() {
    super({
      id: 'rh-onchain',
      title: 'On-Chain',
      infoTooltip:
        'Read live from the Robinhood Chain RPC: total supply and the balance held at ' +
        'the burn addresses. Backing per token is the protocol treasury (DefiLlama TVL ' +
        'plus staking) divided by circulating supply — the risk-free value floor. ' +
        '"vs price" under 1.00x means the token trades below its backing.',
    });
  }

  public renderOnchain(tokens: RHToken[]): void {
    const burners = tokens
      .filter(t => t.burnPct != null && t.burnPct > 0.01)
      .sort((a, b) => (b.burnPct ?? 0) - (a.burnPct ?? 0));

    const backed = tokens.filter(t => t.primary.kind === 'usdPerToken' && t.primary.value != null);

    if (burners.length === 0 && backed.length === 0) {
      this.showError('No on-chain reads available');
      return;
    }

    const backingRows = backed.map(t => {
      const backing = t.primary.value as number;
      const ratio = t.price ? backing / t.price : null;
      return `
        <tr>
          <td class="rh-sym">${escapeHtml(t.symbol)}</td>
          <td class="rh-num">${fmtPrice(t.price)}</td>
          <td class="rh-num">${fmtPrice(backing)}</td>
          <td class="rh-num ${ratio != null && ratio >= 1 ? 'rh-up' : 'rh-down'}">${ratio != null ? `${ratio.toFixed(2)}x` : '—'}</td>
        </tr>
      `;
    }).join('');

    const burnRows = burners.map(t => `
      <tr>
        <td class="rh-sym">${escapeHtml(t.symbol)}</td>
        <td class="rh-num">${fmtPctPlain(t.burnPct, 2)}</td>
        <td class="rh-num">${fmtCount(t.burned)}</td>
        <td class="rh-num ${changeClass(t.burnChange7d)}">${t.burnChange7d != null ? `${t.burnChange7d >= 0 ? '+' : ''}${t.burnChange7d.toFixed(2)}pp` : '—'}</td>
      </tr>
    `).join('');

    const unbacked = tokens.filter(
      t => t.primary.source === 'defillama+rpc' && t.primary.value == null
    );

    this.setContent(`
      ${backed.length > 0 ? `
        <div class="rh-subhead">TREASURY BACKING</div>
        <div class="rh-table-wrap">
          <table class="rh-table">
            <thead><tr>
              <th class="rh-th-left">Token</th><th class="rh-num">Price</th>
              <th class="rh-num">Backing</th><th class="rh-num">vs price</th>
            </tr></thead>
            <tbody>${backingRows}</tbody>
          </table>
        </div>` : ''}
      ${burners.length > 0 ? `
        <div class="rh-subhead">SUPPLY BURNED</div>
        <div class="rh-table-wrap">
          <table class="rh-table">
            <thead><tr>
              <th class="rh-th-left">Token</th><th class="rh-num">Burned</th>
              <th class="rh-num">Tokens</th><th class="rh-num">7d</th>
            </tr></thead>
            <tbody>${burnRows}</tbody>
          </table>
        </div>` : ''}
      ${unbacked.length > 0 ? `
        <div class="rh-note">No treasury adapter for ${unbacked.map(t => escapeHtml(t.symbol)).join(', ')} — set the vault address in the registry to light these up.</div>` : ''}
    `);
  }
}
