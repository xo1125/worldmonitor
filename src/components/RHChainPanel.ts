import { Panel } from './Panel';
import { fmtUsd, fmtPct, fmtCount, changeClass, sparkline, type RHChain } from '@/services/robinhood';

/** Chain-level vitals: the denominator every token on the tab is measured against. */
export class RHChainPanel extends Panel {
  constructor() {
    super({
      id: 'rh-chain',
      title: 'Robinhood Chain',
      infoTooltip:
        'Chain-wide fundamentals from DefiLlama. TVL trend is derived from our own ' +
        '30-minute snapshots, since DefiLlama reports levels rather than growth.',
    });
  }

  private tile(label: string, value: string, sub?: string, subClass = ''): string {
    return `
      <div class="rh-tile">
        <div class="rh-tile-label">${label}</div>
        <div class="rh-tile-value">${value}</div>
        ${sub ? `<div class="rh-tile-sub ${subClass}">${sub}</div>` : ''}
      </div>
    `;
  }

  public renderChain(chain: RHChain): void {
    if (!chain) {
      this.showError('Chain data unavailable');
      return;
    }

    const feeCapture =
      chain.fees24h && chain.dexVolume24h ? (chain.fees24h / chain.dexVolume24h) * 100 : null;

    const html = `
      <div class="rh-tiles">
        ${this.tile('DeFi TVL', fmtUsd(chain.tvl),
          chain.tvlChange7d != null ? `${fmtPct(chain.tvlChange7d)} 7d` : 'tracking…',
          changeClass(chain.tvlChange7d))}
        ${this.tile('App fees 24h', fmtUsd(chain.fees24h),
          `${fmtPct(chain.feesChange1d)} 1d`, changeClass(chain.feesChange1d))}
        ${this.tile('DEX vol 24h', fmtUsd(chain.dexVolume24h),
          `${fmtPct(chain.dexChange1d)} 1d`, changeClass(chain.dexChange1d))}
        ${this.tile('Stablecoins', fmtUsd(chain.stablecoinMcap), 'circulating')}
        ${this.tile('Fees 7d', fmtUsd(chain.fees7d),
          `${fmtPct(chain.feesChange7d)} vs prev`, changeClass(chain.feesChange7d))}
        ${this.tile('DEX vol 7d', fmtUsd(chain.dexVolume7d),
          `${fmtPct(chain.dexChange7d)} vs prev`, changeClass(chain.dexChange7d))}
        ${this.tile('Fee take', feeCapture != null ? `${feeCapture.toFixed(3)}%` : '—', 'of DEX volume')}
        ${this.tile('Apps tracked', fmtCount(chain.appCount),
          chain.dexCount != null ? `${chain.dexCount} DEXs` : '')}
      </div>
      ${chain.tvlSpark && chain.tvlSpark.length > 2
        ? `<div class="rh-chain-spark">${sparkline(chain.tvlSpark, 280, 34)}<span class="rh-tile-sub">TVL, last ${chain.tvlSpark.length} snapshots</span></div>`
        : ''}
    `;
    this.setContent(html);
  }
}
