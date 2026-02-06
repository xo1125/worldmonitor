import { Panel } from './Panel';
import type { MacroSignalResult } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

export class MacroSignalsPanel extends Panel {
  constructor() {
    super({ id: 'macro-signals', title: 'Market Radar' });
  }

  public renderSignals(result: MacroSignalResult): void {
    const verdictClass = result.verdict === 'BUY' ? 'verdict-buy' : 'verdict-cash';

    const signalCards = result.signals
      .map((signal) => {
        const statusClass = signal.status === 'bullish' ? 'signal-bullish' : signal.status === 'bearish' ? 'signal-bearish' : 'signal-neutral';
        return `
        <div class="macro-signal-card">
          <div class="macro-signal-name">${escapeHtml(signal.name)}</div>
          <div class="macro-signal-status ${statusClass}">${escapeHtml(signal.label)}</div>
          <div class="macro-signal-value">${escapeHtml(signal.value)}</div>
        </div>
      `;
      })
      .join('');

    const html = `
      <div class="macro-signals-container">
        <div class="macro-verdict ${verdictClass}">${result.verdict}</div>
        <div class="macro-signals-grid">${signalCards}</div>
      </div>
    `;

    this.setContent(html);
  }
}
