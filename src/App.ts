import type { NewsItem, Monitor, PanelConfig } from '@/types';
import {
  FEEDS,
  SECTORS,
  COMMODITIES,
  MARKET_SYMBOLS,
  REFRESH_INTERVALS,
  DEFAULT_PANELS,
  STORAGE_KEYS,
} from '@/config';
import { fetchCategoryFeeds, fetchMultipleStocks, fetchStablecoins, fetchCryptoSectors, fetchMacroSignals, fetchTokenCategories, fetchETFFlows, fetchPredictions } from '@/services';
import { fetchRobinhoodWatchlist, relativeTime, type RHPayload } from '@/services/robinhood';
import { clusterNewsHybrid } from '@/services/clustering';
import { dataFreshness } from '@/services/data-freshness';
import { loadFromStorage, saveToStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import type { PredictionMarket, MarketData } from '@/types';
import {
  NewsPanel,
  MarketPanel,
  HeatmapPanel,
  CommoditiesPanel,
  PredictionPanel,
  MonitorPanel,
  Panel,
  StatusPanel,
  SearchModal,
  MobileWarningModal,
  LiveNewsPanel,
  StablecoinSupplyPanel,
  BTCMonitorPanel,
  CryptoHeatmapPanel,
  SignalCardPanel,
  TokenCategoryPanel,
  ETFFlowsPanel,
  RHWatchlistPanel,
  RHChainPanel,
  RHRevenuePanel,
  RHTokenPage,
} from '@/components';
import type { SearchResult } from '@/components/SearchModal';

type TabId = 'macro' | 'robinhood';

const TABS: Array<{ id: TabId; label: string; hint: string; path: string }> = [
  { id: 'macro', label: 'MACRO', hint: 'BTC, ETFs, stablecoins, macro signals', path: '/' },
  { id: 'robinhood', label: 'ROBINHOOD', hint: 'Robinhood Chain token watchlist', path: '/watch' },
];

const tabForPath = (pathname: string): TabId | null => {
  const clean = pathname.replace(/\/+$/, '');
  return TABS.find(t => t.path !== '/' && (clean === t.path || clean.startsWith(`${t.path}/`)))?.id ?? null;
};

/** /watch/pons -> PONS. Anything else on the tab is the list view. */
const tokenForPath = (pathname: string): string | null => {
  const m = pathname.replace(/\/+$/, '').match(/^\/watch\/([A-Za-z0-9$_-]{1,20})$/);
  return m?.[1] ? decodeURIComponent(m[1]).toUpperCase() : null;
};

export class App {
  private container: HTMLElement;
  private readonly PANEL_ORDER_KEY = 'panel-order-v2';
  private panels: Record<string, Panel> = {};
  private newsPanels: Record<string, NewsPanel> = {};
  private allNews: NewsItem[] = [];
  private monitors: Monitor[];
  private panelSettings: Record<string, PanelConfig>;
  private statusPanel: StatusPanel | null = null;
  // export panel removed
  private searchModal: SearchModal | null = null;
  private mobileWarningModal: MobileWarningModal | null = null;
  private latestPredictions: PredictionMarket[] = [];
  private latestMarkets: MarketData[] = [];
  // latestClusters removed (was only used by ExportPanel)
  private inFlight: Set<string> = new Set();
  private timeIntervalId: ReturnType<typeof setInterval> | null = null;
  private refreshTimeoutIds: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private isDestroyed = false;
  private boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundFullscreenHandler: (() => void) | null = null;
  private boundResizeHandler: (() => void) | null = null;
  private boundVisibilityHandler: (() => void) | null = null;
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private boundIdleResetHandler: (() => void) | null = null;
  private isIdle = false;
  private readonly IDLE_PAUSE_MS = 2 * 60 * 1000; // 2 minutes - pause animations when idle
  private disabledSources: Set<string> = new Set();
  private activeTab: TabId = 'macro';
  private rhPanels: Record<string, Panel> = {};
  private rhLoaded = false;
  private macroLoaded = false;
  private rhTokenPage: RHTokenPage | null = null;
  private activeToken: string | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container ${containerId} not found`);
    this.container = el;

    this.monitors = loadFromStorage<Monitor[]>(STORAGE_KEYS.monitors, []);

    const storedPanels = loadFromStorage<Record<string, PanelConfig>>(
      STORAGE_KEYS.panels,
      DEFAULT_PANELS
    );
    // Merge any new panels from DEFAULT_PANELS that aren't in stored settings
    this.panelSettings = { ...DEFAULT_PANELS, ...storedPanels };
    console.log('[App] Loaded panel settings from storage:', Object.entries(this.panelSettings).filter(([_, v]) => !v.enabled).map(([k]) => k));

    this.disabledSources = new Set(loadFromStorage<string[]>(STORAGE_KEYS.disabledFeeds, []));
  }

  public async init(): Promise<void> {
    this.renderLayout();
    this.setupMobileWarning();
    this.setupStatusPanel();
    this.setupSearchModal();
    this.setupEventListeners();
    this.setupTabs();

    // Only the visible tab loads on boot. Opening /watch shouldn't pay for the
    // macro tab's feeds, market calls and prediction markets.
    if (this.activeTab === 'macro') await this.loadMacroData();

    this.setupRefreshIntervals();
  }

  private setupMobileWarning(): void {
    if (MobileWarningModal.shouldShow()) {
      this.mobileWarningModal = new MobileWarningModal();
      this.mobileWarningModal.show();
    }
  }

  private setupStatusPanel(): void {
    this.statusPanel = new StatusPanel();
    const headerLeft = this.container.querySelector('.header-left');
    if (headerLeft) {
      headerLeft.appendChild(this.statusPanel.getElement());
    }
    this.updateOpexBadge();
  }

  /** Render OPEX countdown badge in the main dashboard header */
  private updateOpexBadge(): void {
    const OPEX_DATES = [
      { date: '2026-02-20', label: 'Feb Monthly Opex' },
      { date: '2026-03-27', label: 'Mar Quarterly Opex' },
      { date: '2026-04-24', label: 'Apr Monthly Opex' },
    ];
    const badge = document.getElementById('opexBadge');
    if (!badge) return;

    const now = new Date();
    const upcoming = OPEX_DATES
      .map(o => ({ ...o, dt: new Date(o.date + 'T08:00:00Z') }))
      .filter(o => o.dt > now)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];

    if (!upcoming) { badge.innerHTML = ''; return; }

    const daysUntil = Math.ceil((upcoming.dt.getTime() - now.getTime()) / 86400000);
    const urgentClass = daysUntil <= 3 ? 'opex-urgent' : '';

    badge.innerHTML = `
      <span class="opex-tag ${urgentClass}">
        <span class="opex-label">OPEX</span>
        <span class="opex-info">${upcoming.label}</span>
        <span class="opex-days">${daysUntil}d</span>
      </span>
    `;
  }

  private setupSearchModal(): void {
    const searchOptions = {
      placeholder: 'Search crypto, tokens, DeFi, stablecoins...',
      hint: 'Crypto • DeFi • Stablecoins • Sectors • News • Markets',
    };
    this.searchModal = new SearchModal(this.container, searchOptions);

    // Handle result selection
    this.searchModal.setOnSelect((result) => this.handleSearchResult(result));

    // Global keyboard shortcut
    this.boundKeydownHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (this.searchModal?.isOpen()) {
          this.searchModal.close();
        } else {
          // Update search index with latest data before opening
          this.updateSearchIndex();
          this.searchModal?.open();
        }
      }
    };
    document.addEventListener('keydown', this.boundKeydownHandler);
  }

  private handleSearchResult(result: SearchResult): void {
    switch (result.type) {
      case 'news': {
        const item = result.data as NewsItem;
        this.scrollToPanel('live-news');
        this.highlightNewsItem(item.link);
        break;
      }
      case 'market': {
        this.scrollToPanel('markets');
        break;
      }
      case 'prediction': {
        this.scrollToPanel('polymarket');
        break;
      }
    }
  }

  private scrollToPanel(panelId: string): void {
    const panel = document.querySelector(`[data-panel="${panelId}"]`);
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.classList.add('flash-highlight');
      setTimeout(() => panel.classList.remove('flash-highlight'), 1500);
    }
  }

  private highlightNewsItem(itemId: string): void {
    setTimeout(() => {
      const item = document.querySelector(`[data-news-id="${itemId}"]`);
      if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.classList.add('flash-highlight');
        setTimeout(() => item.classList.remove('flash-highlight'), 1500);
      }
    }, 100);
  }

  private updateSearchIndex(): void {
    if (!this.searchModal) return;

    // Update news sources (use link as unique id) - index up to 500 items for better search coverage
    const newsItems = this.allNews.slice(0, 500).map(n => ({
      id: n.link,
      title: n.title,
      subtitle: n.source,
      data: n,
    }));
    console.log(`[Search] Indexing ${newsItems.length} news items (allNews total: ${this.allNews.length})`);
    this.searchModal.registerSource('news', newsItems);

    // Update predictions if available
    if (this.latestPredictions.length > 0) {
      this.searchModal.registerSource('prediction', this.latestPredictions.map(p => ({
        id: p.title,
        title: p.title,
        subtitle: `${(p.yesPrice * 100).toFixed(0)}% probability`,
        data: p,
      })));
    }

    // Update markets if available
    if (this.latestMarkets.length > 0) {
      this.searchModal.registerSource('market', this.latestMarkets.map(m => ({
        id: m.symbol,
        title: `${m.symbol} - ${m.name}`,
        subtitle: `$${m.price?.toFixed(2) || 'N/A'}`,
        data: m,
      })));
    }
  }

  private renderLayout(): void {
    this.container.innerHTML = `
      <div class="header">
        <div class="header-left">
          <span class="logo">FC MONITOR</span><span class="version">v${__APP_VERSION__}</span>
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>LIVE</span>
          </div>
          <span class="opex-header-badge" id="opexBadge"></span>
        </div>
        <div class="header-right">
          <button class="search-btn" id="searchBtn"><kbd>⌘K</kbd> Search</button>
          <span class="time-display" id="timeDisplay">--:--:-- UTC</span>
          <button class="fullscreen-btn" id="fullscreenBtn" title="Toggle Fullscreen">⛶</button>
          <button class="settings-btn" id="settingsBtn">⚙ PANELS</button>
          <button class="sources-btn" id="sourcesBtn">📡 SOURCES</button>
        </div>
      </div>
      <div class="tab-bar" id="tabBar">
        ${TABS.map(t => `
          <button class="tab-btn" id="tab-${t.id}" data-tab="${t.id}" title="${t.hint}">${t.label}</button>
        `).join('')}
        <span class="tab-meta" id="tabMeta"></span>
        <button class="tab-refresh" id="rhRefresh" title="Refresh Robinhood data now (bypasses the 2 min cache)">↻</button>
      </div>
      <div class="main-content">
        <div class="map-section" id="mapSection" style="display:none"></div>
        <div class="panels-grid" id="panelsGrid"></div>
        <div class="panels-grid rh-grid grid-hidden" id="rhGrid"></div>
      </div>
      <div class="modal-overlay" id="settingsModal">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Panel Settings</span>
            <button class="modal-close" id="modalClose">×</button>
          </div>
          <div class="panel-toggle-grid" id="panelToggles"></div>
        </div>
      </div>
      <div class="modal-overlay" id="sourcesModal">
        <div class="modal sources-modal">
          <div class="modal-header">
            <span class="modal-title">News Sources</span>
            <span class="sources-counter" id="sourcesCounter"></span>
            <button class="modal-close" id="sourcesModalClose">×</button>
          </div>
          <div class="sources-search">
            <input type="text" id="sourcesSearch" placeholder="Filter sources..." />
          </div>
          <div class="sources-toggle-grid" id="sourceToggles"></div>
          <div class="sources-footer">
            <button class="sources-select-all" id="sourcesSelectAll">Select All</button>
            <button class="sources-select-none" id="sourcesSelectNone">Select None</button>
          </div>
        </div>
      </div>
    `;

    this.createPanels();
    this.createRobinhoodPanels();
    this.renderPanelToggles();
    this.updateTime();
    this.timeIntervalId = setInterval(() => this.updateTime(), 1000);
  }

  /**
   * Clean up resources (for HMR/testing)
   */
  public destroy(): void {
    for (const panel of Object.values(this.rhPanels)) panel.destroy();
    this.rhPanels = {};
    this.rhTokenPage?.destroy();
    this.rhTokenPage = null;
    this.isDestroyed = true;

    // Clear time display interval
    if (this.timeIntervalId) {
      clearInterval(this.timeIntervalId);
      this.timeIntervalId = null;
    }

    // Clear all refresh timeouts
    for (const timeoutId of this.refreshTimeoutIds.values()) {
      clearTimeout(timeoutId);
    }
    this.refreshTimeoutIds.clear();

    // Remove global event listeners
    if (this.boundKeydownHandler) {
      document.removeEventListener('keydown', this.boundKeydownHandler);
      this.boundKeydownHandler = null;
    }
    if (this.boundFullscreenHandler) {
      document.removeEventListener('fullscreenchange', this.boundFullscreenHandler);
      this.boundFullscreenHandler = null;
    }
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }
    if (this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }

    // Clean up idle detection
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    if (this.boundIdleResetHandler) {
      ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
        document.removeEventListener(event, this.boundIdleResetHandler!);
      });
      this.boundIdleResetHandler = null;
    }
  }

  private createPanels(): void {
    const panelsGrid = document.getElementById('panelsGrid')!;

    // Create all panels
    const techPanel = new NewsPanel('tech', 'Technology / AI');
    this.newsPanels['tech'] = techPanel;
    this.panels['tech'] = techPanel;

    const financePanel = new NewsPanel('finance', 'Financial News');
    this.newsPanels['finance'] = financePanel;
    this.panels['finance'] = financePanel;

    const heatmapPanel = new HeatmapPanel();
    this.panels['heatmap'] = heatmapPanel;

    const marketsPanel = new MarketPanel();
    this.panels['markets'] = marketsPanel;

    const monitorPanel = new MonitorPanel(this.monitors);
    this.panels['monitors'] = monitorPanel;
    monitorPanel.onChanged((monitors) => {
      this.monitors = monitors;
      saveToStorage(STORAGE_KEYS.monitors, monitors);
      this.updateMonitorResults();
    });

    const commoditiesPanel = new CommoditiesPanel();
    this.panels['commodities'] = commoditiesPanel;

    const predictionPanel = new PredictionPanel();
    this.panels['polymarket'] = predictionPanel;

    const govPanel = new NewsPanel('gov', 'Government / Policy');
    this.newsPanels['gov'] = govPanel;
    this.panels['gov'] = govPanel;

    // Token category panels
    const TOKEN_CATEGORY_PANELS: Array<[string, string]> = [
      ['tokens-bluechips', 'Majors'],
      ['tokens-defi', 'DeFi Tokens'],
      ['tokens-ai', 'AI Tokens'],
      ['tokens-other', 'Tokens (Other)'],
    ];
    for (const [panelId, panelTitle] of TOKEN_CATEGORY_PANELS) {
      this.panels[panelId] = new TokenCategoryPanel(panelId, panelTitle);
    }

    // Crypto variant panels
    const cryptoHeatmapPanel = new CryptoHeatmapPanel();
    this.panels['crypto-heatmap'] = cryptoHeatmapPanel;

    // Individual signal panels (split from Market Radar)
    const SIGNAL_PANELS: Array<[string, string]> = [
      ['signal-liquidity', 'Liquidity'],
      ['signal-flow', 'Flow Structure'],
      ['signal-macro', 'Macro Regime'],
      ['signal-momentum', 'Momentum'],
      ['signal-hashrate', 'Hash Rate'],
      ['signal-feargreed', 'Fear & Greed'],
      ['signal-altseason', 'Crypto (Alts)'],
    ];
    for (const [panelId, panelTitle] of SIGNAL_PANELS) {
      this.panels[panelId] = new SignalCardPanel(panelId, panelTitle);
    }

    const etfFlowsPanel = new ETFFlowsPanel();
    this.panels['etf-flows'] = etfFlowsPanel;

    const stablecoinSupplyPanel = new StablecoinSupplyPanel();
    this.panels['stablecoin-supply'] = stablecoinSupplyPanel;

    const btcMonitorPanel = new BTCMonitorPanel();
    this.panels['btc-monitor'] = btcMonitorPanel;

    // Crypto-specific news panels
    const cryptoRegulationPanel = new NewsPanel('regulation', 'Crypto Regulation');
    this.newsPanels['regulation'] = cryptoRegulationPanel;
    this.panels['regulation'] = cryptoRegulationPanel;

    const tradingPanel = new NewsPanel('trading', 'Trading & Analysis');
    this.newsPanels['trading'] = tradingPanel;
    this.panels['trading'] = tradingPanel;

    const layoffsPanel = new NewsPanel('layoffs', 'Layoffs Tracker');
    this.newsPanels['layoffs'] = layoffsPanel;
    this.panels['layoffs'] = layoffsPanel;

    const aiPanel = new NewsPanel('ai', 'AI / ML');
    this.newsPanels['ai'] = aiPanel;
    this.panels['ai'] = aiPanel;

    const securityPanel = new NewsPanel('security', 'Cybersecurity');
    this.newsPanels['security'] = securityPanel;
    this.panels['security'] = securityPanel;

    const liveNewsPanel = new LiveNewsPanel();
    this.panels['live-news'] = liveNewsPanel;

    // Add panels to grid in saved order
    // Use DEFAULT_PANELS keys for variant-aware panel order
    const defaultOrder = Object.keys(DEFAULT_PANELS).filter(k => k !== 'map');
    const savedOrder = this.getSavedPanelOrder();
    // Merge saved order with default to include new panels
    let panelOrder = defaultOrder;
    if (savedOrder.length > 0) {
      // Add any missing panels from default that aren't in saved order
      const missing = defaultOrder.filter(k => !savedOrder.includes(k));
      // Remove any saved panels that no longer exist
      const valid = savedOrder.filter(k => defaultOrder.includes(k));
      // Insert missing panels at the end (except monitors which goes last)
      const monitorsIdx = valid.indexOf('monitors');
      if (monitorsIdx !== -1) valid.splice(monitorsIdx, 1); // Remove monitors temporarily
      const insertIdx = valid.length;
      const newPanels = missing.filter(k => k !== 'monitors');
      valid.splice(insertIdx, 0, ...newPanels);
      valid.push('monitors'); // Always put monitors last
      panelOrder = valid;
    }

    // CRITICAL: live-news MUST be first for CSS Grid layout (spans 2 columns)
    // Move it to position 0 if it exists and isn't already first
    const liveNewsIdx = panelOrder.indexOf('live-news');
    if (liveNewsIdx > 0) {
      panelOrder.splice(liveNewsIdx, 1);
      panelOrder.unshift('live-news');
    }

    panelOrder.forEach((key: string) => {
      const panel = this.panels[key];
      if (panel) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });

    this.applyPanelSettings();
  }

  /**
   * The Robinhood tab lives in its own grid rather than in the shared panel set:
   * panel order, drag state and the settings modal all key off DEFAULT_PANELS,
   * and a second variant would have to fight all three. Two grids, one visible.
   */
  private createRobinhoodPanels(): void {
    const grid = document.getElementById('rhGrid');
    if (!grid) return;

    this.rhPanels['rh-chain'] = new RHChainPanel();
    this.rhPanels['rh-watchlist'] = new RHWatchlistPanel();
    this.rhPanels['rh-revenue'] = new RHRevenuePanel();

    for (const panel of Object.values(this.rhPanels)) {
      grid.appendChild(panel.getElement());
    }

    // Token pages live beside the grid, not over it: they are real URLs.
    const main = grid.parentElement ?? grid;
    this.rhTokenPage = new RHTokenPage(main);
    this.rhTokenPage.hide();
    this.rhTokenPage.setOnBack(() => this.showTokenList());

    const openToken = (symbol: string) => this.showToken(symbol);
    (this.rhPanels['rh-watchlist'] as RHWatchlistPanel).setOnSelect(openToken);
    (this.rhPanels['rh-revenue'] as RHRevenuePanel).setOnSelect(openToken);
  }

  private setupTabs(): void {
    const params = new URLSearchParams(window.location.search);
    const fromPath = tabForPath(window.location.pathname);
    // Read before switchTab, which normalises the path and would erase the symbol.
    const initialToken = tokenForPath(window.location.pathname);
    const fromQuery = params.get('tab');
    // The URL is the only source of truth. Each view has its own HTML shell, so
    // restoring a remembered tab at / would render the watchlist inside the macro
    // page's markup and metadata.
    const initial = (fromPath ?? TABS.find(t => t.id === fromQuery)?.id ?? 'macro') as TabId;

    // Back/forward between / and /watch.
    window.addEventListener('popstate', () => {
      const tab = tabForPath(window.location.pathname) ?? 'macro';
      this.switchTab(tab, { skipUrl: true });
      const token = tokenForPath(window.location.pathname);
      if (tab === 'robinhood') {
        if (token) this.showToken(token, { skipUrl: true });
        else this.showTokenList({ skipUrl: true });
      }
    });

    document.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as TabId;
        if (tab) this.switchTab(tab);
      });
    });

    document.getElementById('rhRefresh')?.addEventListener('click', () => {
      void this.refreshRobinhood();
    });

    this.switchTab(initial, { replaceUrl: true });

    if (initial === 'robinhood' && initialToken) {
      this.showToken(initialToken, { skipUrl: true });
      // Restore the URL switchTab normalised away.
      const url = new URL(window.location.href);
      url.pathname = `/watch/${initialToken.toLowerCase()}`;
      window.history.replaceState({}, '', url);
    }
  }

  private switchTab(tab: TabId, opts: { replaceUrl?: boolean; skipUrl?: boolean } = {}): void {
    this.activeTab = tab;

    // Toggled by class, not inline style: the responsive rules set
    // `.panels-grid { display: flex !important }`, which beats an inline display.
    const macroGrid = document.getElementById('panelsGrid');
    const rhGrid = document.getElementById('rhGrid');
    macroGrid?.classList.toggle('grid-hidden', tab !== 'macro');
    // A token page owns the Robinhood side while it is open.
    const showingToken = tab === 'robinhood' && this.activeToken !== null;
    rhGrid?.classList.toggle('grid-hidden', tab !== 'robinhood' || showingToken);
    if (tab !== 'robinhood') {
      this.rhTokenPage?.hide();
      this.activeToken = null;
    } else if (showingToken) {
      this.rhTokenPage?.show();
    }
    document.getElementById('rhRefresh')?.classList.toggle('hidden', tab !== 'robinhood' || showingToken);

    document.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (!opts.skipUrl) {
      const url = new URL(window.location.href);
      url.pathname = this.activeToken && tab === 'robinhood'
        ? `/watch/${this.activeToken.toLowerCase()}`
        : TABS.find(t => t.id === tab)?.path ?? '/';
      // ?tab= is the old form; drop it now that the path carries the state.
      url.searchParams.delete('tab');
      window.history[opts.replaceUrl ? 'replaceState' : 'pushState']({}, '', url);
    }

    if (tab === 'macro' && !this.macroLoaded) void this.loadMacroData();

    // Load on first view rather than on boot: the macro tab shouldn't pay for
    // the Robinhood fan-out on every page load.
    if (tab === 'robinhood' && !this.rhLoaded) {
      this.rhLoaded = true;
      void this.loadRobinhoodData();
    } else if (tab === 'robinhood') {
      this.updateTabMeta();
    } else {
      const meta = document.getElementById('tabMeta');
      if (meta) meta.textContent = '';
    }
  }

  private lastRHPayload: RHPayload | null = null;

  /** Show one token's page and put it in the URL. */
  private showToken(symbol: string, opts: { skipUrl?: boolean } = {}): void {
    this.activeToken = symbol;
    document.getElementById('rhGrid')?.classList.add('grid-hidden');
    this.rhTokenPage?.show();
    void this.rhTokenPage?.open(symbol);

    if (!opts.skipUrl) {
      const url = new URL(window.location.href);
      url.pathname = `/watch/${symbol.toLowerCase()}`;
      window.history.pushState({}, '', url);
    }
    document.getElementById('rhRefresh')?.classList.add('hidden');
  }

  private showTokenList(opts: { skipUrl?: boolean } = {}): void {
    this.activeToken = null;
    this.rhTokenPage?.hide();
    document.getElementById('rhGrid')?.classList.remove('grid-hidden');
    document.getElementById('rhRefresh')?.classList.remove('hidden');

    if (!opts.skipUrl) {
      const url = new URL(window.location.href);
      url.pathname = '/watch';
      window.history.pushState({}, '', url);
    }
  }

  private updateTabMeta(): void {
    const meta = document.getElementById('tabMeta');
    if (!meta) return;
    if (this.activeTab !== 'robinhood' || !this.lastRHPayload) {
      meta.textContent = '';
      return;
    }
    const p = this.lastRHPayload;
    const bits = [
      `${p.coverage.priced}/${p.coverage.total} priced`,
      `updated ${relativeTime(p.updatedAt)}`,
    ];
    if (p.coverage.historySamples > 0) bits.push(`${p.coverage.historySamples} snapshots`);
    if (p.carriedFields) bits.push(`${p.carriedFields} carried`);
    if (p.stale) bits.push('stale');
    meta.textContent = bits.join(' · ');
    meta.classList.toggle('tab-meta-stale', Boolean(p.stale));
  }

  /** Manual refresh: force a rebuild upstream rather than waiting out the poll. */
  private async refreshRobinhood(): Promise<void> {
    const btn = document.getElementById('rhRefresh');
    if (btn?.classList.contains('spinning')) return;
    btn?.classList.add('spinning');
    try {
      this.rhLoaded = true;
      await this.loadRobinhoodData(true);
    } finally {
      btn?.classList.remove('spinning');
    }
  }

  /** Loads the macro tab once; repeat calls are handled by the refresh loops. */
  private async loadMacroData(): Promise<void> {
    if (this.macroLoaded) return;
    this.macroLoaded = true;
    try {
      await this.loadAllData();
    } catch (e) {
      this.macroLoaded = false;
      throw e;
    }
  }

  private async loadRobinhoodData(force = false): Promise<void> {
    const payload = await fetchRobinhoodWatchlist(force);
    if (!payload) {
      for (const panel of Object.values(this.rhPanels)) {
        panel.showError('Robinhood Chain feed unavailable');
      }
      return;
    }

    this.lastRHPayload = payload;
    (this.rhPanels['rh-chain'] as RHChainPanel)?.renderChain(payload.chain);
    (this.rhPanels['rh-watchlist'] as RHWatchlistPanel)?.renderTokens(payload.tokens);
    (this.rhPanels['rh-revenue'] as RHRevenuePanel)?.setTokens(payload.tokens);
    (this.rhPanels['rh-revenue'] as RHRevenuePanel)?.renderProtocols(payload.protocols);
    this.updateTabMeta();
  }

  private getSavedPanelOrder(): string[] {
    try {
      const saved = localStorage.getItem(this.PANEL_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  private savePanelOrder(): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid) return;
    const order = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);
    localStorage.setItem(this.PANEL_ORDER_KEY, JSON.stringify(order));
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.draggable = true;
    el.dataset.panel = key;

    el.addEventListener('dragstart', (e) => {
      const target = e.target as HTMLElement;
      // Don't start drag if panel is being resized
      if (el.dataset.resizing === 'true') {
        e.preventDefault();
        return;
      }
      // Don't start drag if target is the resize handle
      if (target.classList.contains('panel-resize-handle') || target.closest('.panel-resize-handle')) {
        e.preventDefault();
        return;
      }
      el.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', key);
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this.savePanelOrder();
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = document.querySelector('.dragging');
      if (!dragging || dragging === el) return;

      const grid = document.getElementById('panelsGrid');
      if (!grid) return;

      const siblings = Array.from(grid.children).filter((c) => c !== dragging);
      const nextSibling = siblings.find((sibling) => {
        const rect = sibling.getBoundingClientRect();
        return e.clientY < rect.top + rect.height / 2;
      });

      if (nextSibling) {
        grid.insertBefore(dragging, nextSibling);
      } else {
        grid.appendChild(dragging);
      }
    });
  }

  private setupEventListeners(): void {
    // Search button
    document.getElementById('searchBtn')?.addEventListener('click', () => {
      this.updateSearchIndex();
      this.searchModal?.open();
    });

    // Settings modal
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.add('active');
    });

    document.getElementById('modalClose')?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.remove('active');
    });

    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
        document.getElementById('settingsModal')?.classList.remove('active');
      }
    });

    // Sources modal
    this.setupSourcesModal();

    // Fullscreen toggle
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    this.boundFullscreenHandler = () => {
      fullscreenBtn!.textContent = document.fullscreenElement ? '⛶' : '⛶';
      fullscreenBtn!.classList.toggle('active', !!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', this.boundFullscreenHandler);

    // Pause animations when tab is hidden
    this.boundVisibilityHandler = () => {
      document.body.classList.toggle('animations-paused', document.hidden);
      if (!document.hidden) {
        this.resetIdleTimer();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    // Idle detection - pause animations after 2 minutes of inactivity
    this.setupIdleDetection();
  }

  private setupIdleDetection(): void {
    this.boundIdleResetHandler = () => {
      // User is active - resume animations if we were idle
      if (this.isIdle) {
        this.isIdle = false;
        document.body.classList.remove('animations-paused');
      }
      this.resetIdleTimer();
    };

    // Track user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.addEventListener(event, this.boundIdleResetHandler!, { passive: true });
    });

    // Start the idle timer
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
    }
    this.idleTimeoutId = setTimeout(() => {
      if (!document.hidden) {
        this.isIdle = true;
        document.body.classList.add('animations-paused');
        console.log('[App] User idle - pausing animations to save resources');
      }
    }, this.IDLE_PAUSE_MS);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  private renderPanelToggles(): void {
    const container = document.getElementById('panelToggles')!;
    container.innerHTML = Object.entries(this.panelSettings)
      .map(
        ([key, panel]) => `
        <div class="panel-toggle-item ${panel.enabled ? 'active' : ''}" data-panel="${key}">
          <div class="panel-toggle-checkbox">${panel.enabled ? '✓' : ''}</div>
          <span class="panel-toggle-label">${panel.name}</span>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.panel-toggle-item').forEach((item) => {
      item.addEventListener('click', () => {
        const panelKey = (item as HTMLElement).dataset.panel!;
        const config = this.panelSettings[panelKey];
        console.log('[Panel Toggle] Clicked:', panelKey, 'Current enabled:', config?.enabled);
        if (config) {
          config.enabled = !config.enabled;
          console.log('[Panel Toggle] New enabled:', config.enabled);
          saveToStorage(STORAGE_KEYS.panels, this.panelSettings);
          this.renderPanelToggles();
          this.applyPanelSettings();
          console.log('[Panel Toggle] After apply - config.enabled:', this.panelSettings[panelKey]?.enabled);
        }
      });
    });
  }

  private getAllSourceNames(): string[] {
    const sources = new Set<string>();
    Object.values(FEEDS).forEach(feeds => {
      if (feeds) feeds.forEach(f => sources.add(f.name));
    });
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }

  private renderSourceToggles(filter = ''): void {
    const container = document.getElementById('sourceToggles')!;
    const allSources = this.getAllSourceNames();
    const filterLower = filter.toLowerCase();
    const filteredSources = filter
      ? allSources.filter(s => s.toLowerCase().includes(filterLower))
      : allSources;

    container.innerHTML = filteredSources.map(source => {
      const isEnabled = !this.disabledSources.has(source);
      const escaped = escapeHtml(source);
      return `
        <div class="source-toggle-item ${isEnabled ? 'active' : ''}" data-source="${escaped}">
          <div class="source-toggle-checkbox">${isEnabled ? '✓' : ''}</div>
          <span class="source-toggle-label">${escaped}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.source-toggle-item').forEach(item => {
      item.addEventListener('click', () => {
        const sourceName = (item as HTMLElement).dataset.source!;
        if (this.disabledSources.has(sourceName)) {
          this.disabledSources.delete(sourceName);
        } else {
          this.disabledSources.add(sourceName);
        }
        saveToStorage(STORAGE_KEYS.disabledFeeds, Array.from(this.disabledSources));
        this.renderSourceToggles(filter);
      });
    });

    // Update counter
    const enabledCount = allSources.length - this.disabledSources.size;
    const counterEl = document.getElementById('sourcesCounter');
    if (counterEl) {
      counterEl.textContent = `${enabledCount}/${allSources.length} enabled`;
    }
  }

  private setupSourcesModal(): void {
    document.getElementById('sourcesBtn')?.addEventListener('click', () => {
      document.getElementById('sourcesModal')?.classList.add('active');
      // Clear search and show all sources on open
      const searchInput = document.getElementById('sourcesSearch') as HTMLInputElement | null;
      if (searchInput) searchInput.value = '';
      this.renderSourceToggles();
    });

    document.getElementById('sourcesModalClose')?.addEventListener('click', () => {
      document.getElementById('sourcesModal')?.classList.remove('active');
    });

    document.getElementById('sourcesModal')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
        document.getElementById('sourcesModal')?.classList.remove('active');
      }
    });

    document.getElementById('sourcesSearch')?.addEventListener('input', (e) => {
      const filter = (e.target as HTMLInputElement).value;
      this.renderSourceToggles(filter);
    });

    document.getElementById('sourcesSelectAll')?.addEventListener('click', () => {
      this.disabledSources.clear();
      saveToStorage(STORAGE_KEYS.disabledFeeds, []);
      const filter = (document.getElementById('sourcesSearch') as HTMLInputElement)?.value || '';
      this.renderSourceToggles(filter);
    });

    document.getElementById('sourcesSelectNone')?.addEventListener('click', () => {
      const allSources = this.getAllSourceNames();
      this.disabledSources = new Set(allSources);
      saveToStorage(STORAGE_KEYS.disabledFeeds, allSources);
      const filter = (document.getElementById('sourcesSearch') as HTMLInputElement)?.value || '';
      this.renderSourceToggles(filter);
    });
  }

  private applyPanelSettings(): void {
    Object.entries(this.panelSettings).forEach(([key, config]) => {
      if (key === 'map') {
        // Map is always hidden in crypto variant
        return;
      }
      const panel = this.panels[key];
      panel?.toggle(config.enabled);
    });
  }

  private updateTime(): void {
    const now = new Date();
    const el = document.getElementById('timeDisplay');
    if (el) {
      el.textContent = now.toUTCString().split(' ')[4] + ' UTC';
    }
  }

  private async loadAllData(): Promise<void> {
    const runGuarded = async (name: string, fn: () => Promise<void>): Promise<void> => {
      if (this.inFlight.has(name)) return;
      this.inFlight.add(name);
      try {
        await fn();
      } finally {
        this.inFlight.delete(name);
      }
    };

    const tasks: Array<{ name: string; task: Promise<void> }> = [
      { name: 'news', task: runGuarded('news', () => this.loadNews()) },
      { name: 'markets', task: runGuarded('markets', () => this.loadMarkets()) },
      { name: 'predictions', task: runGuarded('predictions', () => this.loadPredictions()) },
    ];

    // Use allSettled to ensure all tasks complete and search index always updates
    const results = await Promise.allSettled(tasks.map(t => t.task));

    // Log any failures but don't block
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`[App] ${tasks[idx]?.name} load failed:`, result.reason);
      }
    });

    // Always update search index regardless of individual task failures
    this.updateSearchIndex();
  }

  private async loadNewsCategory(category: string, feeds: typeof FEEDS.trading): Promise<NewsItem[]> {
    try {
      const panel = this.newsPanels[category];
      const renderIntervalMs = 250;
      let lastRenderTime = 0;
      let renderTimeout: ReturnType<typeof setTimeout> | null = null;
      let pendingItems: NewsItem[] | null = null;

      // Filter out disabled sources
      const enabledFeeds = (feeds ?? []).filter(f => !this.disabledSources.has(f.name));
      if (enabledFeeds.length === 0) {
        if (panel) panel.showError('All sources disabled');
        this.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
          status: 'ok',
          itemCount: 0,
        });
        return [];
      }

      const flushPendingRender = () => {
        if (!panel || !pendingItems) return;
        panel.renderNews(pendingItems);
        pendingItems = null;
        lastRenderTime = Date.now();
      };

      const scheduleRender = (partialItems: NewsItem[]) => {
        if (!panel) return;
        pendingItems = partialItems;
        const elapsed = Date.now() - lastRenderTime;
        if (elapsed >= renderIntervalMs) {
          if (renderTimeout) {
            clearTimeout(renderTimeout);
            renderTimeout = null;
          }
          flushPendingRender();
          return;
        }

        if (!renderTimeout) {
          renderTimeout = setTimeout(() => {
            renderTimeout = null;
            flushPendingRender();
          }, renderIntervalMs - elapsed);
        }
      };

      const items = await fetchCategoryFeeds(enabledFeeds, {
        onBatch: (partialItems) => {
          scheduleRender(partialItems);
        },
      });

      if (panel) {
        if (renderTimeout) {
          clearTimeout(renderTimeout);
          renderTimeout = null;
          pendingItems = null;
        }
        panel.renderNews(items);
      }

      this.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
        status: 'ok',
        itemCount: items.length,
      });
      this.statusPanel?.updateApi('RSS Proxy', { status: 'ok' });

      return items;
    } catch (error) {
      this.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
        status: 'error',
        errorMessage: String(error),
      });
      this.statusPanel?.updateApi('RSS Proxy', { status: 'error' });
      return [];
    }
  }

  private async loadNews(): Promise<void> {
    // Build categories dynamically based on what feeds exist
    const allCategories = [
      { key: 'bitcoin', feeds: FEEDS.bitcoin },
      { key: 'ethereum', feeds: FEEDS.ethereum },
      { key: 'altcoins', feeds: FEEDS.altcoins },
      { key: 'defi', feeds: FEEDS.defi },
      { key: 'nft', feeds: FEEDS.nft },
      { key: 'regulation', feeds: FEEDS.regulation },
      { key: 'trading', feeds: FEEDS.trading },
      { key: 'finance', feeds: FEEDS.finance },
    ];
    // Filter to only categories that have feeds defined
    const categories = allCategories.filter(c => c.feeds && c.feeds.length > 0);

    // Fetch all categories in parallel
    const categoryResults = await Promise.allSettled(
      categories.map(({ key, feeds }) => this.loadNewsCategory(key, feeds))
    );

    // Collect successful results
    const collectedNews: NewsItem[] = [];
    categoryResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        collectedNews.push(...result.value);
      } else {
        console.error(`[App] News category ${categories[idx]?.key} failed:`, result.reason);
      }
    });

    this.allNews = collectedNews;

    // Update monitors
    this.updateMonitorResults();

    // Update clusters for correlation analysis
    try {
      await clusterNewsHybrid(this.allNews);
    } catch (error) {
      console.error('[App] Clustering failed:', error);
    }
  }

  private async loadMarkets(): Promise<void> {
    try {
      // Stocks
      const stocks = await fetchMultipleStocks(MARKET_SYMBOLS, {
        onBatch: (partialStocks) => {
          this.latestMarkets = partialStocks;
          (this.panels['markets'] as MarketPanel).renderMarkets(partialStocks);
        },
      });
      this.latestMarkets = stocks;
      (this.panels['markets'] as MarketPanel).renderMarkets(stocks);
      this.statusPanel?.updateApi('Finnhub', { status: 'ok' });

      // Sectors
      const sectors = await fetchMultipleStocks(
        SECTORS.map((s) => ({ ...s, display: s.name })),
        {
          onBatch: (partialSectors) => {
            (this.panels['heatmap'] as HeatmapPanel).renderHeatmap(
              partialSectors.map((s) => ({ name: s.name, change: s.change }))
            );
          },
        }
      );
      (this.panels['heatmap'] as HeatmapPanel).renderHeatmap(
        sectors.map((s) => ({ name: s.name, change: s.change }))
      );

      // Commodities
      const commodities = await fetchMultipleStocks(COMMODITIES, {
        onBatch: (partialCommodities) => {
          (this.panels['commodities'] as CommoditiesPanel).renderCommodities(
            partialCommodities.map((c) => ({
              display: c.display,
              price: c.price,
              change: c.change,
            }))
          );
        },
      });
      (this.panels['commodities'] as CommoditiesPanel).renderCommodities(
        commodities.map((c) => ({ display: c.display, price: c.price, change: c.change }))
      );
    } catch {
      this.statusPanel?.updateApi('Finnhub', { status: 'error' });
    }

    // Token category panels (Bluechips, DeFi, AI, Other)
    try {
      const categories = await fetchTokenCategories();
      for (const cat of categories) {
        (this.panels[cat.panelId] as TokenCategoryPanel)?.renderTokens(cat.tokens);
      }
      this.statusPanel?.updateApi('CoinGecko', { status: 'ok' });
    } catch {
      this.statusPanel?.updateApi('CoinGecko', { status: 'error' });
    }

    // Load stablecoins, crypto sectors, macro signals
    try {
      const stablecoinResult = await fetchStablecoins();
      (this.panels['stablecoin-supply'] as StablecoinSupplyPanel)?.renderSupply(stablecoinResult.coins, stablecoinResult.summary);
    } catch (e) {
      console.error('[App] Stablecoins load failed:', e);
    }

    try {
      const btcLevelsRes = await fetch('/api/btc-levels');
      if (btcLevelsRes.ok) {
        const btcLevelsData = await btcLevelsRes.json();
        (this.panels['btc-monitor'] as BTCMonitorPanel)?.renderLevels(btcLevelsData);
      }
    } catch (e) {
      console.error('[App] BTC levels load failed:', e);
    }

    try {
      const sectors = await fetchCryptoSectors();
      (this.panels['crypto-heatmap'] as CryptoHeatmapPanel)?.renderSectors(sectors);
    } catch (e) {
      console.error('[App] Crypto sectors load failed:', e);
    }

    try {
      const macroData = await fetchMacroSignals();
      this.statusPanel?.updateApi('Macro Signals', { status: macroData ? 'ok' : 'error' });
      if (macroData) {
        // Map signal names to panel IDs
        const signalPanelMap: Record<string, string> = {
          'Liquidity': 'signal-liquidity',
          'Flow Structure': 'signal-flow',
          'Macro Regime': 'signal-macro',
          'Momentum': 'signal-momentum',
          'Hash Rate': 'signal-hashrate',
          'Fear & Greed': 'signal-feargreed',
          'Crypto (Alts)': 'signal-altseason',
        };
        for (const signal of macroData.signals) {
          const panelId = signalPanelMap[signal.name];
          if (panelId) {
            (this.panels[panelId] as SignalCardPanel)?.renderSignal(signal);
          }
        }
      }
    } catch (e) {
      console.error('[App] Macro signals load failed:', e);
      this.statusPanel?.updateApi('Macro Signals', { status: 'error' });
    }

    // ETF Flows
    try {
      const etfData = await fetchETFFlows();
      if (etfData) {
        (this.panels['etf-flows'] as ETFFlowsPanel)?.renderFlows(etfData);
      }
    } catch (e) {
      console.error('[App] ETF flows load failed:', e);
    }
  }

  private async loadPredictions(): Promise<void> {
    try {
      const predictions = await fetchPredictions();
      this.latestPredictions = predictions;
      (this.panels['polymarket'] as PredictionPanel).renderPredictions(predictions);

      this.statusPanel?.updateFeed('Polymarket', { status: 'ok', itemCount: predictions.length });
      this.statusPanel?.updateApi('Polymarket', { status: 'ok' });
      dataFreshness.recordUpdate('polymarket', predictions.length);
    } catch (error) {
      this.statusPanel?.updateFeed('Polymarket', { status: 'error', errorMessage: String(error) });
      this.statusPanel?.updateApi('Polymarket', { status: 'error' });
      dataFreshness.recordError('polymarket', String(error));
    }
  }

  private updateMonitorResults(): void {
    const monitorPanel = this.panels['monitors'] as MonitorPanel;
    monitorPanel.renderResults(this.allNews);
  }

  private scheduleRefresh(
    name: string,
    fn: () => Promise<void>,
    intervalMs: number,
    condition?: () => boolean
  ): void {
    const HIDDEN_REFRESH_MULTIPLIER = 4;
    const JITTER_FRACTION = 0.1;
    const MIN_REFRESH_MS = 1000;
    const computeDelay = (baseMs: number, isHidden: boolean) => {
      const adjusted = baseMs * (isHidden ? HIDDEN_REFRESH_MULTIPLIER : 1);
      const jitterRange = adjusted * JITTER_FRACTION;
      const jittered = adjusted + (Math.random() * 2 - 1) * jitterRange;
      return Math.max(MIN_REFRESH_MS, Math.round(jittered));
    };
    const scheduleNext = (delay: number) => {
      if (this.isDestroyed) return;
      const timeoutId = setTimeout(run, delay);
      this.refreshTimeoutIds.set(name, timeoutId);
    };
    const run = async () => {
      if (this.isDestroyed) return;
      const isHidden = document.visibilityState === 'hidden';
      if (isHidden) {
        scheduleNext(computeDelay(intervalMs, true));
        return;
      }
      if (condition && !condition()) {
        scheduleNext(computeDelay(intervalMs, false));
        return;
      }
      if (this.inFlight.has(name)) {
        scheduleNext(computeDelay(intervalMs, false));
        return;
      }
      this.inFlight.add(name);
      try {
        await fn();
      } catch (e) {
        console.error(`[App] Refresh ${name} failed:`, e);
      } finally {
        this.inFlight.delete(name);
        scheduleNext(computeDelay(intervalMs, false));
      }
    };
    scheduleNext(computeDelay(intervalMs, document.visibilityState === 'hidden'));
  }

  private setupRefreshIntervals(): void {
    // Always refresh news, markets, predictions
    const macroReady = () => this.macroLoaded;
    this.scheduleRefresh('news', () => this.loadNews(), REFRESH_INTERVALS.feeds, macroReady);
    this.scheduleRefresh('markets', () => this.loadMarkets(), REFRESH_INTERVALS.markets, macroReady);
    this.scheduleRefresh('predictions', () => this.loadPredictions(), REFRESH_INTERVALS.predictions, macroReady);

    // Crypto-specific refreshes
    this.scheduleRefresh('token-categories', async () => {
      try {
        const categories = await fetchTokenCategories();
        for (const cat of categories) {
          (this.panels[cat.panelId] as TokenCategoryPanel)?.renderTokens(cat.tokens);
        }
      } catch (e) {
        console.error('[App] Token categories refresh failed:', e);
      }
    }, 120000, macroReady); // 2 min (matches API cache)

    this.scheduleRefresh('etf-flows', async () => {
      try {
        const data = await fetchETFFlows();
        if (data) {
          (this.panels['etf-flows'] as ETFFlowsPanel)?.renderFlows(data);
        }
      } catch (e) {
        console.error('[App] ETF flows refresh failed:', e);
      }
    }, 900000, macroReady); // 15 min

    this.scheduleRefresh('btc-monitor', async () => {
      try {
        const res = await fetch('/api/btc-levels');
        if (res.ok) {
          const data = await res.json();
          (this.panels['btc-monitor'] as BTCMonitorPanel)?.renderLevels(data);
        }
      } catch (e) {
        console.error('[App] BTC levels refresh failed:', e);
      }
    }, 300000, macroReady); // 5 min

    // The condition argument keeps the Robinhood fan-out idle while the macro
    // tab is showing; scheduleRefresh already backs off on hidden documents.
    this.scheduleRefresh('rh-watchlist', async () => {
      await this.loadRobinhoodData();
    }, 120000, () => this.activeTab === 'robinhood' && this.rhLoaded);

    this.scheduleRefresh('macro-signals', async () => {
      try {
        const macroData = await fetchMacroSignals();
        if (macroData) {
          const signalPanelMap: Record<string, string> = {
            'Liquidity': 'signal-liquidity',
            'Flow Structure': 'signal-flow',
            'Macro Regime': 'signal-macro',
            'Momentum': 'signal-momentum',
            'Hash Rate': 'signal-hashrate',
            'Fear & Greed': 'signal-feargreed',
            'Crypto (Alts)': 'signal-altseason',
          };
          for (const signal of macroData.signals) {
            const panelId = signalPanelMap[signal.name];
            if (panelId) {
              (this.panels[panelId] as SignalCardPanel)?.renderSignal(signal);
            }
          }
        }
      } catch (e) {
        console.error('[App] Macro signals refresh failed:', e);
      }
    }, 300000, macroReady); // 5 min
  }
}
