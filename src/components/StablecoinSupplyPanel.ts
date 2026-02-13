import { Panel } from './Panel';
import type { StablecoinData, StablecoinSummary } from '@/types';

export class StablecoinSupplyPanel extends Panel {
  constructor() {
    super({ id: 'stablecoin-supply', title: 'Stablecoins' });
  }

  public renderSupply(data: StablecoinData[], summary?: StablecoinSummary): void {
    if (data.length === 0) {
      this.showError('Failed to load stablecoin data');
      return;
    }

    const totalSupply = summary?.totalMarketCap ?? data.reduce((sum, coin) => sum + (coin.marketCap || 0), 0);
    const totalMcapChange = data.reduce((sum, coin) => sum + (coin.mcapChange24h || 0), 0);

    const formatB = (n: number): string => {
      if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
      if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
      return `$${n.toLocaleString()}`;
    };

    const formatChange = (n: number): string => {
      const abs = Math.abs(n);
      const sign = n >= 0 ? '+' : '-';
      if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
      if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
      return `${sign}$${Math.round(abs)}`;
    };

    const flowClass = totalMcapChange >= 0 ? 'supply-inflow' : 'supply-outflow';

    // Health status banner from server summary
    const healthStatus = summary?.healthStatus ?? this.computeLocalHealth(data);
    const healthClass = healthStatus === 'HEALTHY' ? 'health-ok' : healthStatus === 'CAUTION' ? 'health-caution' : 'health-warning';
    const healthIcon = healthStatus === 'HEALTHY' ? '●' : healthStatus === 'CAUTION' ? '◐' : '▲';
    const healthLabel = healthStatus === 'HEALTHY' ? 'All Pegs Stable' : healthStatus === 'CAUTION' ? 'Minor Deviation' : 'Depeg Alert';

    const breakdown = data
      .filter(c => c.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap)
      .map(coin => {
        // Use server pegStatus if available, otherwise compute locally
        const pegStatus = coin.pegStatus ?? this.computePegStatus(coin.price);
        const pegDeviation = coin.pegDeviation ?? Math.abs(coin.price - 1.0) * 100;
        const pegBadgeClass = pegStatus === 'ON_PEG' ? 'peg-badge-ok' : pegStatus === 'SLIGHT_DEPEG' ? 'peg-badge-caution' : 'peg-badge-danger';
        const pegBadgeText = pegStatus === 'ON_PEG' ? 'ON PEG' : pegStatus === 'SLIGHT_DEPEG' ? 'SLIGHT' : 'DEPEG';
        const volStr = coin.volume24h ? formatB(coin.volume24h) : '--';

        return `
          <div class="supply-row">
            <span class="supply-symbol">${coin.symbol}</span>
            <span class="supply-price">$${coin.price.toFixed(4)}</span>
            <span class="supply-peg-cell"><span class="peg-badge ${pegBadgeClass}">${pegBadgeText}</span> <span class="peg-deviation">${pegDeviation.toFixed(2)}%</span></span>
            <span class="supply-mcap">${formatB(coin.marketCap)}</span>
            <span class="supply-vol">${volStr}</span>
          </div>
        `;
      })
      .join('');

    const html = `
      <div class="supply-container">
        <div class="supply-health-banner ${healthClass}">
          <span class="health-icon">${healthIcon}</span>
          <span class="health-label">${healthLabel}</span>
        </div>
        <div class="supply-header-compact">
          <div class="supply-total-compact">
            <span class="supply-total-label-sm">Total Supply</span>
            <span class="supply-total-num">${formatB(totalSupply)}</span>
          </div>
          <div class="supply-flow ${flowClass}">
            <span class="supply-flow-label">24h Net</span>
            <span class="supply-flow-value">${formatChange(totalMcapChange)}</span>
          </div>
        </div>
        <div class="supply-breakdown">
          <div class="supply-header-row">
            <span>Token</span>
            <span>Price</span>
            <span>Peg</span>
            <span>Supply</span>
            <span>24h Vol</span>
          </div>
          ${breakdown}
        </div>
      </div>
    `;

    this.setContent(html);
  }

  private computePegStatus(price: number): 'ON_PEG' | 'SLIGHT_DEPEG' | 'DEPEGGED' {
    const dev = Math.abs(price - 1.0);
    if (dev <= 0.005) return 'ON_PEG';
    if (dev <= 0.01) return 'SLIGHT_DEPEG';
    return 'DEPEGGED';
  }

  private computeLocalHealth(data: StablecoinData[]): 'HEALTHY' | 'CAUTION' | 'WARNING' {
    const statuses = data.map(c => c.pegStatus ?? this.computePegStatus(c.price));
    if (statuses.some(s => s === 'DEPEGGED')) return 'WARNING';
    if (statuses.filter(s => s === 'SLIGHT_DEPEG').length >= 2) return 'CAUTION';
    return 'HEALTHY';
  }
}
