import { Panel } from './Panel';
import type { MacroSignal } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

// Map signal names to external URLs
const SIGNAL_LINKS: Record<string, string> = {
  'Liquidity': 'https://www.tradingview.com/chart/?symbol=BTCUSDT',
  'Flow Structure': 'https://www.tradingview.com/chart/?symbol=BTCUSDT&interval=240',
  'Macro Regime': 'https://www.tradingview.com/chart/?symbol=DXY',
  'Technical Trend': 'https://www.tradingview.com/chart/?symbol=BTCUSD',
  'Hash Rate': 'https://mempool.space/graphs/mining/hashrate-difficulty',
  'Mining Cost': 'https://www.braiins.com/blog/bitcoin-mining-analogy',
  'Fear & Greed': 'https://alternative.me/crypto/fear-and-greed-index/',
};

export class SignalCardPanel extends Panel {
  constructor(id: string, title: string) {
    super({ id, title });
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

  private renderDonut(value: number): string {
    // SVG donut gauge for Fear & Greed (0-100)
    const clamped = Math.max(0, Math.min(100, value));
    const radius = 36;
    const stroke = 8;
    const center = 44;
    const circumference = 2 * Math.PI * radius;
    const arcLength = (clamped / 100) * circumference;
    const bgArc = circumference;

    // Color gradient: 0=red, 25=orange, 50=yellow, 75=lime, 100=green
    let color: string;
    if (clamped <= 25) color = '#f87171';       // Extreme Fear → red
    else if (clamped <= 45) color = '#fb923c';  // Fear → orange
    else if (clamped <= 55) color = '#fbbf24';  // Neutral → yellow
    else if (clamped <= 75) color = '#a3e635';  // Greed → lime
    else color = '#4ade80';                      // Extreme Greed → green

    // Label
    let label: string;
    if (clamped <= 25) label = 'Extreme Fear';
    else if (clamped <= 45) label = 'Fear';
    else if (clamped <= 55) label = 'Neutral';
    else if (clamped <= 75) label = 'Greed';
    else label = 'Extreme Greed';

    return `
      <div class="fg-donut-container">
        <svg class="fg-donut" viewBox="0 0 ${center * 2} ${center * 2}">
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none"
            stroke="rgba(255,255,255,0.08)" stroke-width="${stroke}" />
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none"
            stroke="${color}" stroke-width="${stroke}"
            stroke-dasharray="${arcLength} ${bgArc}"
            stroke-dashoffset="0"
            stroke-linecap="round"
            transform="rotate(-90 ${center} ${center})" />
          <text x="${center}" y="${center - 4}" text-anchor="middle" dominant-baseline="middle"
            fill="${color}" font-size="18" font-weight="700" font-family="'JetBrains Mono', monospace">${clamped}</text>
          <text x="${center}" y="${center + 14}" text-anchor="middle" dominant-baseline="middle"
            fill="rgba(255,255,255,0.5)" font-size="8" font-weight="500">${label}</text>
        </svg>
      </div>
    `;
  }

  private isFearGreed(signal: MacroSignal): boolean {
    return signal.name === 'feargreed' || this.panelId === 'signal-feargreed';
  }

  private renderSupportingData(data?: Record<string, string>): string {
    if (!data) return '';

    const items = Object.entries(data)
      .map(([key, val]) => `<span class="macro-kv"><span class="macro-key">${escapeHtml(key)}</span> <span class="macro-val">${escapeHtml(val)}</span></span>`)
      .join('');

    return `<div class="macro-supporting">${items}</div>`;
  }

  public renderSignal(signal: MacroSignal): void {
    const statusClass = signal.status === 'bullish' ? 'signal-bullish' : signal.status === 'bearish' ? 'signal-bearish' : 'signal-neutral';
    const isFG = this.isFearGreed(signal);

    // Get link URL for this signal
    const linkUrl = SIGNAL_LINKS[signal.label] ?? SIGNAL_LINKS[signal.name] ?? '';
    const linkOpen = linkUrl ? `<a href="${linkUrl}" target="_blank" rel="noopener" class="signal-card-link">` : '';
    const linkClose = linkUrl ? '</a>' : '';

    // For Fear & Greed, show donut instead of sparkline
    const visualHtml = isFG
      ? this.renderDonut(parseFloat(signal.value) || 50)
      : this.renderSparkline(signal.sparkline);

    const html = `
      ${linkOpen}
      <div class="signal-card-solo ${statusClass}${linkUrl ? ' signal-clickable' : ''}">
        <div class="macro-signal-top">
          <span class="macro-signal-badge ${statusClass}">${escapeHtml(signal.label)}</span>
          ${linkUrl ? '<span class="signal-link-icon">↗</span>' : ''}
        </div>
        ${isFG ? '' : `<div class="macro-signal-value">${escapeHtml(signal.value)}</div>`}
        ${visualHtml}
        ${isFG ? '' : this.renderSupportingData(signal.supportingData)}
        <div class="macro-signal-detail">${escapeHtml(signal.detail)}</div>
      </div>
      ${linkClose}
    `;

    this.setContent(html);
  }
}
