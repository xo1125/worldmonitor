import { Panel } from './Panel';
import type { CryptoSectorData } from '@/types';
import { escapeHtml } from '@/utils/sanitize';
import { formatChange, getChangeClass } from '@/utils';

export class CryptoHeatmapPanel extends Panel {
  constructor() {
    super({ id: 'crypto-heatmap', title: 'Crypto Sectors' });
  }

  public renderSectors(data: CryptoSectorData[]): void {
    if (data.length === 0) {
      this.showError('Failed to load sector data');
      return;
    }

    const html =
      '<div class="crypto-heatmap">' +
      data
        .map((sector) => {
          const sectorClass = sector.change >= 0 ? 'sector-up' : 'sector-down';
          return `
          <div class="crypto-sector-cell ${sectorClass}">
            <div class="crypto-sector-name">${escapeHtml(sector.name)}</div>
            <div class="crypto-sector-change ${getChangeClass(sector.change)}">${formatChange(sector.change)}</div>
          </div>
        `;
        })
        .join('') +
      '</div>';

    this.setContent(html);
  }
}
