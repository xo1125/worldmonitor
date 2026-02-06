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

    const cards = data
      .map((subnet) => {
        const netuidDisplay = typeof subnet.netuid === 'number' ? `SN${subnet.netuid}` : subnet.netuid;
        const statusClass =
          subnet.status === 'active'
            ? 'subnet-active'
            : subnet.status === 'inactive'
              ? 'subnet-inactive'
              : 'subnet-unknown';
        const statusDot =
          subnet.status === 'active'
            ? '●'
            : subnet.status === 'inactive'
              ? '○'
              : '◌';

        // Build metrics row if we have live data
        let metricsHtml = '';
        if (subnet.emissions !== undefined && subnet.emissions !== null) {
          metricsHtml += `<span class="subnet-metric" title="Emissions">τ ${typeof subnet.emissions === 'number' ? subnet.emissions.toFixed(2) : subnet.emissions}</span>`;
        }
        if (subnet.validators !== undefined && subnet.validators !== null) {
          metricsHtml += `<span class="subnet-metric" title="Validators">V: ${subnet.validators}</span>`;
        }
        if (subnet.registrations !== undefined && subnet.registrations !== null) {
          metricsHtml += `<span class="subnet-metric" title="Registrations">R: ${subnet.registrations}</span>`;
        }

        // Link to taostats for numeric netuids
        const linkUrl = typeof subnet.netuid === 'number'
          ? `https://taostats.io/subnets/${subnet.netuid}/`
          : '#';
        const linkTarget = typeof subnet.netuid === 'number' ? ' target="_blank" rel="noopener"' : '';

        return `
          <a href="${linkUrl}"${linkTarget} class="tao-subnet-card ${statusClass}">
            <div class="subnet-header">
              <span class="subnet-name">${escapeHtml(subnet.name)}</span>
              <span class="subnet-netuid">${escapeHtml(String(netuidDisplay))}</span>
            </div>
            <div class="subnet-status">
              <span class="subnet-dot">${statusDot}</span>
              <span>${escapeHtml(subnet.status)}</span>
            </div>
            ${metricsHtml ? `<div class="subnet-metrics">${metricsHtml}</div>` : ''}
          </a>
        `;
      })
      .join('');

    // TAO price header (shared across all subnets)
    const taoPrice = data[0]?.taoPrice;
    const taoChange = data[0]?.taoChange;
    let priceHeader = '';
    if (taoPrice !== undefined) {
      const changeClass = (taoChange ?? 0) > 0 ? 'change-up' : (taoChange ?? 0) < 0 ? 'change-down' : 'change-flat';
      const changePrefix = (taoChange ?? 0) > 0 ? '+' : '';
      priceHeader = `
        <div class="tao-price-header">
          <span class="tao-price-label">TAO</span>
          <span class="tao-price-value">${taoPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="tao-price-change ${changeClass}">${changePrefix}${(taoChange ?? 0).toFixed(2)}%</span>
        </div>
      `;
    }

    const html = `${priceHeader}<div class="tao-subnets-grid">${cards}</div>`;
    this.setContent(html);
  }
}
