import { Panel } from './Panel';
import type { MacroSignalResult } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export class MacroSignalsPanel extends Panel {
  constructor() {
    super({ id: 'macro-signals', title: 'Market Radar' });
  }

  private renderSparkline(data?: number[]): string {
    if (!data || data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 100;
    const height = 24;

    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    // Determine color from trend (first vs last)
    const last = data[data.length - 1] ?? 0;
    const first = data[0] ?? 0;
    const isUp = last >= first;
    const color = isUp ? '#4ade80' : '#f87171';

    return `
      <svg class="macro-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  private renderSupportingData(data?: Record<string, string>): string {
    if (!data) return '';

    const items = Object.entries(data)
      .map(([key, val]) => `<span class="macro-kv"><span class="macro-key">${escapeHtml(key)}</span> <span class="macro-val">${escapeHtml(val)}</span></span>`)
      .join('');

    return `<div class="macro-supporting">${items}</div>`;
  }

  public renderSignals(result: MacroSignalResult): void {
    const verdictClass = result.verdict === 'BUY' ? 'verdict-buy' : 'verdict-cash';

    const signalCards = result.signals
      .map((signal) => {
        const statusClass = signal.status === 'bullish' ? 'signal-bullish' : signal.status === 'bearish' ? 'signal-bearish' : 'signal-neutral';
        return `
        <div class="macro-signal-card ${statusClass}">
          <div class="macro-signal-top">
            <span class="macro-signal-name">${escapeHtml(signal.name)}</span>
            <span class="macro-signal-badge ${statusClass}">${escapeHtml(signal.label)}</span>
          </div>
          <div class="macro-signal-value">${escapeHtml(signal.value)}</div>
          ${this.renderSparkline(signal.sparkline)}
          ${this.renderSupportingData(signal.supportingData)}
          <div class="macro-signal-detail">${escapeHtml(signal.detail)}</div>
        </div>
      `;
      })
      .join('');

    const html = `
      <div class="macro-signals-container">
        <div class="macro-verdict ${verdictClass}">
          <span class="macro-verdict-label">VERDICT</span>
          <span class="macro-verdict-value">${result.verdict}</span>
        </div>
        <div class="macro-signals-grid">${signalCards}</div>
      </div>
    `;

    this.setContent(html);
  }
}
