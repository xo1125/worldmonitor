import { Panel } from './Panel';
import type { TaoSubnet } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export class TaoSubnetPanel extends Panel {
  constructor() {
    super({ id: 'tao-subnets', title: 'TAO Subnets' });
  }

  public renderSubnets(data: TaoSubnet[]): void {
    if (data.length === 0) {
      this.showError('Failed to load TAO subnet data');
      return;
    }

    // TAO price header
    const taoPrice = data[0]?.taoPrice;
    const taoChange = data[0]?.taoChange;
    let priceHeader = '';
    if (taoPrice !== undefined) {
      const changeClass = (taoChange ?? 0) > 0 ? 'change-up' : (taoChange ?? 0) < 0 ? 'change-down' : 'change-flat';
      const changePrefix = (taoChange ?? 0) > 0 ? '+' : '';
      priceHeader = `
        <div class="tao-price-header">
          <span class="tao-price-label">TAO</span>
          <span class="tao-price-value">$${taoPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="tao-price-change ${changeClass}">${changePrefix}${(taoChange ?? 0).toFixed(2)}%</span>
        </div>
      `;
    }

    // Compact table rows
    const rows = data
      .map((subnet) => {
        const netuidDisplay = typeof subnet.netuid === 'number' ? `SN${subnet.netuid}` : subnet.netuid;
        const statusDot = subnet.status === 'active' ? '●' : subnet.status === 'inactive' ? '○' : '◌';
        const statusClass = subnet.status === 'active' ? 'subnet-active' : subnet.status === 'inactive' ? 'subnet-inactive' : 'subnet-unknown';
        const linkUrl = typeof subnet.netuid === 'number' ? `https://taostats.io/subnets/${subnet.netuid}/` : '#';
        const linkTarget = typeof subnet.netuid === 'number' ? ' target="_blank" rel="noopener"' : '';

        // Emissions display
        const emissionStr = subnet.emissions !== undefined && subnet.emissions !== null
          ? `τ ${typeof subnet.emissions === 'number' ? subnet.emissions.toFixed(2) : subnet.emissions}`
          : '';

        return `
          <a href="${linkUrl}"${linkTarget} class="tao-row ${statusClass}">
            <span class="tao-row-dot">${statusDot}</span>
            <span class="tao-row-name">${escapeHtml(subnet.name)}</span>
            <span class="tao-row-netuid">${escapeHtml(String(netuidDisplay))}</span>
            <span class="tao-row-emission">${emissionStr}</span>
          </a>
        `;
      })
      .join('');

    const html = `
      ${priceHeader}
      <div class="tao-list">
        <div class="tao-list-header">
          <span></span>
          <span>Name</span>
          <span>Subnet</span>
          <span>Emission</span>
        </div>
        ${rows}
      </div>
    `;

    this.setContent(html);
  }
}
