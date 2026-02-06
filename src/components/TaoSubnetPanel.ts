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

    const html = `<div class="tao-subnets-grid">${cards}</div>`;
    this.setContent(html);
  }
}
