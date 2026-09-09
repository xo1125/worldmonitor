import { escapeHtml } from '@/utils/sanitize';
import { fmtUsd, fmtPrice, fmtPct, fmtPctPlain, fmtCount, changeClass } from '@/services/robinhood';

interface SeriesPoint { ts: number; fees: number | null; revenue: number | null }

interface Methodology {
  fees: string | null; revenue: string | null; holders: string | null;
  supplySide: string | null; url: string | null;
}

interface RHDetail {
  symbol: string;
  project: string;
  type: string;
  conviction: string;
  note: string | null;
  description: string | null;
  primaryMetric: string | null;
  methodology: Methodology | null;
  handle: string | null;
  links: { chart: string; explorer: string; defillama: string | null; x: string | null };
  market: {
    price: number | null; change1h: number | null; change6h: number | null; change24h: number | null;
    marketCap: number | null; fdv: number | null; liquidity: number | null; volume24h: number | null;
    turnover: number | null; pairCount: number | null; dexes: string[]; buys24h: number; sells24h: number;
  };
  economics: {
    fees24h: number | null; fees7d: number | null; fees30d: number | null;
    revenue24h: number | null; revenue7d: number | null; revenue30d: number | null;
    annualizedFees: number | null; annualizedRevenue: number | null;
    capture30d: number | null; revenueMultiple: number | null; feesMultiple: number | null;
    allTimeFees: number | null; series: SeriesPoint[];
  } | null;
  treasury: {
    holdings: number | null; tvl: number | null; staking: number | null;
    borrowed: number | null; utilisation: number | null; tvlChange7d: number | null;
    backingPerToken: number | null; backingVsPrice: number | null;
  } | null;
  onchain: { supply: number | null; burned: number | null; burnPct: number | null; circulating: number | null } | null;
  attention: {
    watchlistUsers: number | null; sentimentUp: number | null; rank: number | null;
    twitterHandle: string | null; homepage: string | null; categories: string[];
  } | null;
  error?: string;
}

/**
 * One page per token, at /watch/<symbol>.
 *
 * Everything the watchlist deliberately leaves out lives here, so nothing is
 * stated twice across the tab: the list ranks, this explains. The question it
 * answers is whether the price is supported by anything — revenue, treasury,
 * burn — so valuation leads and market data comes last.
 */
export class RHTokenPage {
  private element: HTMLElement;
  private onBack: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'rh-token-page';
    this.element.innerHTML = `
      <div class="rh-token-head">
        <button class="rh-back">← Watchlist</button>
        <span class="rh-modal-title"></span>
      </div>
      <div class="rh-modal-content"></div>
    `;
    container.appendChild(this.element);
    this.element.querySelector('.rh-back')?.addEventListener('click', () => this.onBack?.());
  }

  public setOnBack(fn: () => void): void {
    this.onBack = fn;
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public async open(symbol: string): Promise<void> {
    this.setTitle(escapeHtml(symbol));
    this.setContent('<div class="rh-modal-loading">Loading…</div>');

    try {
      const res = await fetch(`/api/robinhood-detail?symbol=${encodeURIComponent(symbol)}`);
      const data: RHDetail = await res.json();
      if (!res.ok || data.error) {
        this.setContent(`<div class="error-message">${escapeHtml(data.error || 'Failed to load')}</div>`);
        return;
      }
      this.render(data);
    } catch (e) {
      this.setContent(`<div class="error-message">${escapeHtml(String(e))}</div>`);
    }
  }

  private setTitle(html: string): void {
    const el = this.element.querySelector('.rh-modal-title');
    if (el) el.innerHTML = html;
  }

  private setContent(html: string): void {
    const el = this.element.querySelector('.rh-modal-content');
    if (el) el.innerHTML = html;
  }

  private stat(label: string, value: string, sub = '', cls = ''): string {
    return `
      <div class="rh-stat">
        <div class="rh-stat-label">${label}</div>
        <div class="rh-stat-value ${cls}">${value}</div>
        ${sub ? `<div class="rh-stat-sub">${sub}</div>` : ''}
      </div>
    `;
  }

  /** Fees and revenue as paired daily bars; revenue sits inside the fee bar. */
  private chart(series: SeriesPoint[]): string {
    const points = series.filter(p => p.fees != null);
    if (points.length < 3) return '';
    const max = Math.max(...points.map(p => p.fees || 0));
    if (!max) return '';

    const bars = points.map(p => {
      const feeH = ((p.fees || 0) / max) * 100;
      const revH = ((p.revenue || 0) / max) * 100;
      const date = new Date(p.ts).toISOString().slice(5, 10);
      const title = `${date} — fees ${fmtUsd(p.fees)}, revenue ${fmtUsd(p.revenue)}`;
      return `
        <div class="rh-bar-col" title="${escapeHtml(title)}">
          <div class="rh-bar-fee" style="height:${feeH.toFixed(1)}%">
            <div class="rh-bar-rev" style="height:${feeH > 0 ? ((revH / feeH) * 100).toFixed(1) : 0}%"></div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="rh-chart">
        <div class="rh-chart-head">
          <span>Daily fees vs revenue · ${points.length}d</span>
          <span class="rh-chart-legend">
            <i class="rh-swatch-fee"></i>fees
            <i class="rh-swatch-rev"></i>revenue
          </span>
        </div>
        <div class="rh-bars">${bars}</div>
        <div class="rh-chart-axis"><span>${fmtUsd(max)} peak</span><span>today →</span></div>
      </div>
    `;
  }

  private render(d: RHDetail): void {
    const m = d.market;
    const e = d.economics;
    const o = d.onchain;
    const a = d.attention;

    this.setTitle(
      `${escapeHtml(d.symbol)} <span class="rh-modal-sub">${escapeHtml(d.project)} · ${escapeHtml(d.type)}</span>`
    );

    const valuation = e ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">VALUATION</div>
        <div class="rh-stats">
          ${this.stat('Mcap / revenue', e.revenueMultiple != null ? `${e.revenueMultiple.toFixed(1)}x` : '—',
            'annualised from 30d', e.revenueMultiple != null && e.revenueMultiple < 10 ? 'rh-up' : '')}
          ${this.stat('Mcap / fees', e.feesMultiple != null ? `${e.feesMultiple.toFixed(1)}x` : '—', 'total charged')}
          ${this.stat('Ann. revenue', fmtUsd(e.annualizedRevenue), '30d × 12.17')}
          ${this.stat('Ann. fees', fmtUsd(e.annualizedFees), '30d × 12.17')}
        </div>
      </div>` : '';

    const economics = e ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">FEES &amp; REVENUE</div>
        <table class="rh-table rh-modal-table">
          <thead><tr><th class="rh-th-left"></th><th class="rh-num">24h</th><th class="rh-num">7d</th><th class="rh-num">30d</th></tr></thead>
          <tbody>
            <tr><td class="rh-th-left">Fees</td><td class="rh-num">${fmtUsd(e.fees24h)}</td><td class="rh-num">${fmtUsd(e.fees7d)}</td><td class="rh-num">${fmtUsd(e.fees30d)}</td></tr>
            <tr><td class="rh-th-left">Revenue</td><td class="rh-num">${fmtUsd(e.revenue24h)}</td><td class="rh-num">${fmtUsd(e.revenue7d)}</td><td class="rh-num">${fmtUsd(e.revenue30d)}</td></tr>
          </tbody>
        </table>
        <div class="rh-modal-note">
          Capture ${e.capture30d != null ? `${(e.capture30d * 100).toFixed(1)}%` : '—'} of fees over 30d ·
          all-time fees ${fmtUsd(e.allTimeFees)}
        </div>
        ${this.chart(e.series)}
      </div>` : `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">FEES &amp; REVENUE</div>
        <div class="rh-modal-note">No DefiLlama fee adapter for this project, so revenue cannot be measured.</div>
      </div>`;

    const t = d.treasury;
    const treasury = t ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">TREASURY</div>
        <div class="rh-stats">
          ${this.stat('Backing / token', fmtPrice(t.backingPerToken),
            t.backingVsPrice != null ? `${t.backingVsPrice.toFixed(2)}x price` : '',
            t.backingVsPrice != null && t.backingVsPrice >= 1 ? 'rh-up' : 'rh-down')}
          ${this.stat('Holdings', fmtUsd(t.holdings),
            t.tvlChange7d != null ? `${fmtPct(t.tvlChange7d)} 7d` : '', changeClass(t.tvlChange7d))}
          ${t.borrowed != null
            ? this.stat('Borrowed', fmtUsd(t.borrowed),
                t.utilisation != null ? `${(t.utilisation * 100).toFixed(1)}% utilisation` : '')
            : this.stat('Staked', fmtUsd(t.staking), 'in the protocol')}
        </div>
      </div>` : '';

    const supply = o ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">SUPPLY</div>
        <div class="rh-stats">
          ${this.stat('Burned', fmtPctPlain(o.burnPct, 2), o.burned != null ? `${fmtCount(o.burned)} tokens` : '')}
          ${this.stat('Total supply', fmtCount(o.supply))}
          ${this.stat('Circulating', fmtCount(o.circulating), 'supply less burns')}
        </div>
      </div>` : '';

    const attention = a ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">ATTENTION</div>
        <div class="rh-stats">
          ${this.stat('CG watchlists', fmtCount(a.watchlistUsers), 'users tracking')}
          ${this.stat('Sentiment', a.sentimentUp != null ? `${a.sentimentUp.toFixed(0)}%` : '—', 'bullish votes',
            a.sentimentUp != null && a.sentimentUp >= 50 ? 'rh-up' : 'rh-down')}
          ${this.stat('CG rank', a.rank != null ? `#${a.rank}` : '—', 'by market cap')}
        </div>
        ${a.categories.length ? `<div class="rh-modal-note">${a.categories.map(c => escapeHtml(c)).join(' · ')}</div>` : ''}
      </div>` : '';

    const methodology = d.methodology && (d.methodology.revenue || d.methodology.fees) ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">HOW THIS IS MEASURED</div>
        <dl class="rh-method">
          ${d.methodology.fees ? `<dt>Fees</dt><dd>${escapeHtml(d.methodology.fees)}</dd>` : ''}
          ${d.methodology.revenue ? `<dt>Revenue</dt><dd>${escapeHtml(d.methodology.revenue)}</dd>` : ''}
          ${d.methodology.holders ? `<dt>To holders</dt><dd>${escapeHtml(d.methodology.holders)}</dd>` : ''}
        </dl>
        <div class="rh-modal-note">Source: DefiLlama fee adapter${
          d.methodology.url ? ` · <a href="${escapeHtml(d.methodology.url)}" target="_blank" rel="noopener noreferrer">adapter code ↗</a>` : ''
        }</div>
      </div>` : '';

    const about = (d.description || d.note) ? `
      <div class="rh-modal-section">
        <div class="rh-modal-section-title">ABOUT</div>
        ${d.description ? `<p class="rh-about">${escapeHtml(d.description)}</p>` : ''}
        ${d.note ? `<p class="rh-about rh-about-note">${escapeHtml(d.note)}</p>` : ''}
        <div class="rh-modal-note">
          ${escapeHtml(d.type)} · ${d.conviction === 'high' ? 'high' : 'low'} conviction${
            d.primaryMetric ? ` · tracked on ${escapeHtml(d.primaryMetric.toLowerCase())}` : ''}
        </div>
      </div>` : '';

    const links = [
      ['Chart', d.links.chart],
      ['DefiLlama', d.links.defillama],
      ['Explorer', d.links.explorer],
      ['X', d.links.x],
    ].filter(([, url]) => url) as [string, string][];

    this.setContent(`
      <div class="rh-modal-section">
        <div class="rh-stats">
          ${this.stat('Price', fmtPrice(m.price), `${fmtPct(m.change24h)} 24h`, changeClass(m.change24h))}
          ${this.stat('Market cap', fmtUsd(m.marketCap), m.fdv && m.marketCap && m.fdv > m.marketCap ? `FDV ${fmtUsd(m.fdv)}` : '')}
          ${this.stat('Liquidity', fmtUsd(m.liquidity), m.pairCount ? `${m.pairCount} pairs` : '')}
          ${this.stat('Volume 24h', fmtUsd(m.volume24h), m.turnover != null ? `${m.turnover.toFixed(1)}x turnover` : '',
            m.turnover != null && m.turnover > 3 ? 'rh-warn' : '')}
        </div>
      </div>
      ${about}
      ${valuation}
      ${economics}
      ${methodology}
      ${treasury}
      ${supply}
      ${attention}
      <div class="rh-modal-links">
        ${links.map(([label, url]) =>
          `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`).join('')}
      </div>
    `);
  }

  public show(): void {
    this.element.classList.remove('grid-hidden');
  }

  public hide(): void {
    this.element.classList.add('grid-hidden');
  }

  public destroy(): void {
    this.element.remove();
  }
}
