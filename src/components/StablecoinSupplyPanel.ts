import { Panel } from './Panel';
import type { StablecoinData } from '@/types';

export class StablecoinSupplyPanel extends Panel {
  constructor() {
    super({ id: 'stablecoin-supply', title: 'Stablecoin Supply' });
  }

  public renderSupply(data: StablecoinData[]): void {
    if (data.length === 0) {
      this.showError('Failed to load stablecoin data');
      return;
    }

    // Calculate total supply from market caps
    const totalSupply = data.reduce((sum, coin) => sum + (coin.marketCap || 0), 0);
    const totalVolume = data.reduce((sum, coin) => sum + (coin.volume24h || 0), 0);

    // Format as compact number
    const formatB = (n: number): string => {
      if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
      return `$${n.toLocaleString()}`;
    };

    // Build breakdown rows
    const breakdown = data
      .filter(c => c.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap)
      .map(coin => {
        const pct = totalSupply > 0 ? ((coin.marketCap / totalSupply) * 100).toFixed(1) : '0';
        const pegDev = Math.abs(coin.price - 1.0);
        const pegClass = pegDev <= 0.005 ? 'peg-stable' : pegDev <= 0.01 ? 'peg-warning' : 'peg-danger';
        return `
          <div class="supply-row">
            <span class="supply-symbol">${coin.symbol}</span>
            <span class="supply-mcap">${formatB(coin.marketCap)}</span>
            <span class="supply-pct">${pct}%</span>
            <span class="supply-peg ${pegClass}">$${coin.price.toFixed(4)}</span>
          </div>
        `;
      })
      .join('');

    const html = `
      <div class="supply-container">
        <div class="supply-total">
          <div class="supply-total-label">Total Stablecoin Supply</div>
          <div class="supply-total-value">${formatB(totalSupply)}</div>
          <div class="supply-total-sub">24h Volume: ${formatB(totalVolume)}</div>
        </div>
        <div class="supply-breakdown">
          <div class="supply-header-row">
            <span>Token</span>
            <span>MCap</span>
            <span>Share</span>
            <span>Peg</span>
          </div>
          ${breakdown}
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
