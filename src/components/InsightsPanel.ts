import { Panel } from './Panel';
import { generateSummary } from '@/services/summarization';
import { isMobileDevice } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import type { ClusteredEvent } from '@/types';

export class InsightsPanel extends Panel {
  private isHidden = false;
  private lastBriefUpdate = 0;
  private cachedBrief: string | null = null;
  private static readonly BRIEF_COOLDOWN_MS = 120000; // 2 min cooldown (API has limits)

  constructor() {
    super({
      id: 'insights',
      title: 'AI INSIGHTS',
      showCount: false,
      infoTooltip: `
        <strong>AI-Powered Analysis</strong><br>
        • <strong>Crypto Brief</strong>: AI summary (Groq/OpenRouter)<br>
        • <strong>Sentiment</strong>: News tone analysis<br>
        • <strong>Velocity</strong>: Fast-moving stories<br>
        <em>Desktop only • Powered by Llama 3.3</em>
      `,
    });

    if (isMobileDevice()) {
      this.hide();
      this.isHidden = true;
    }
  }

  // Crypto-specific keywords (high boost)
  private static readonly CRYPTO_KEYWORDS = [
    'exchange', 'protocol', 'token', 'liquidity', 'yield', 'hack', 'exploit',
    'airdrop', 'staking', 'defi', 'nft', 'mining', 'halving', 'etf',
    'sec', 'regulation', 'whale', 'flash crash', 'rug pull', 'bridge',
    'layer 2', 'rollup', 'memecoin', 'bitcoin', 'ethereum', 'solana',
  ];

  // Crisis keywords (moderate boost)
  private static readonly CRISIS_KEYWORDS = [
    'crisis', 'emergency', 'catastrophe', 'disaster', 'collapse', 'humanitarian',
    'sanctions', 'ultimatum', 'threat', 'retaliation', 'escalation', 'tensions',
    'breaking', 'urgent', 'developing', 'exclusive',
  ];

  // Business/tech context that should REDUCE score (demote business news with military words)
  private static readonly DEMOTE_KEYWORDS = [
    'ceo', 'earnings', 'stock', 'startup', 'data center', 'datacenter', 'revenue',
    'quarterly', 'profit', 'investor', 'ipo', 'funding', 'valuation',
  ];

  private getImportanceScore(cluster: ClusteredEvent): number {
    let score = 0;
    const titleLower = cluster.primaryTitle.toLowerCase();

    // Source confirmation (base signal)
    score += cluster.sourceCount * 10;

    // Crypto keywords: high priority (+80 base, +20 per match)
    const cryptoMatches = InsightsPanel.CRYPTO_KEYWORDS.filter(kw => titleLower.includes(kw));
    if (cryptoMatches.length > 0) {
      score += 80 + (cryptoMatches.length * 20);
    }

    // Crisis keywords: moderate priority (+30 base, +10 per match)
    const crisisMatches = InsightsPanel.CRISIS_KEYWORDS.filter(kw => titleLower.includes(kw));
    if (crisisMatches.length > 0) {
      score += 30 + (crisisMatches.length * 10);
    }

    // Demote business/tech news that happens to contain military words
    const demoteMatches = InsightsPanel.DEMOTE_KEYWORDS.filter(kw => titleLower.includes(kw));
    if (demoteMatches.length > 0) {
      score *= 0.3; // Heavy penalty for business context
    }

    // Velocity multiplier
    const velMultiplier: Record<string, number> = {
      'viral': 3,
      'spike': 2.5,
      'elevated': 1.5,
      'normal': 1
    };
    score *= velMultiplier[cluster.velocity?.level ?? 'normal'] ?? 1;

    // Alert bonus
    if (cluster.isAlert) score += 50;

    // Recency bonus (decay over 12 hours)
    const ageMs = Date.now() - cluster.firstSeen.getTime();
    const ageHours = ageMs / 3600000;
    const recencyMultiplier = Math.max(0.5, 1 - (ageHours / 12));
    score *= recencyMultiplier;

    return score;
  }

  private selectTopStories(clusters: ClusteredEvent[], maxCount: number): ClusteredEvent[] {
    // Score ALL clusters first - high-scoring stories override source requirements
    const allScored = clusters
      .map(c => ({ cluster: c, score: this.getImportanceScore(c) }));

    // Filter: require at least 2 sources OR alert OR elevated velocity OR high score
    const candidates = allScored.filter(({ cluster: c, score }) =>
      c.sourceCount >= 2 ||
      c.isAlert ||
      (c.velocity && c.velocity.level !== 'normal') ||
      score > 100
    );

    // Sort by score
    const scored = candidates.sort((a, b) => b.score - a.score);

    // Select with source diversity (max 3 from same primary source)
    const selected: ClusteredEvent[] = [];
    const sourceCount = new Map<string, number>();
    const MAX_PER_SOURCE = 3;

    for (const { cluster } of scored) {
      const source = cluster.primarySource;
      const count = sourceCount.get(source) || 0;

      if (count < MAX_PER_SOURCE) {
        selected.push(cluster);
        sourceCount.set(source, count + 1);
      }

      if (selected.length >= maxCount) break;
    }

    return selected;
  }

  private setProgress(step: number, total: number, message: string): void {
    const percent = Math.round((step / total) * 100);
    this.setContent(`
      <div class="insights-progress">
        <div class="insights-progress-bar">
          <div class="insights-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="insights-progress-info">
          <span class="insights-progress-step">Step ${step}/${total}</span>
          <span class="insights-progress-message">${message}</span>
        </div>
      </div>
    `);
  }

  public async updateInsights(clusters: ClusteredEvent[]): Promise<void> {
    if (this.isHidden) return;

    if (clusters.length === 0) {
      this.setContent('<div class="insights-empty">Waiting for news data...</div>');
      return;
    }

    const totalSteps = 2;

    try {
      // Step 1: Filter and rank stories by composite importance score
      this.setProgress(1, totalSteps, 'Ranking important stories...');

      const importantClusters = this.selectTopStories(clusters, 8);

      if (importantClusters.length === 0) {
        this.setContent('<div class="insights-empty">No breaking or multi-source stories yet</div>');
        return;
      }

      const titles = importantClusters.map(c => c.primaryTitle);

      // Step 2: Generate Crypto Brief (with cooldown)
      let worldBrief = this.cachedBrief;
      const now = Date.now();

      if (!worldBrief || now - this.lastBriefUpdate > InsightsPanel.BRIEF_COOLDOWN_MS) {
        this.setProgress(2, totalSteps, 'Generating crypto brief...');

        const result = await generateSummary(titles, (_step, _total, msg) => {
          this.setProgress(2, totalSteps, `Generating brief: ${msg}`);
        });

        if (result) {
          worldBrief = result.summary;
          this.cachedBrief = worldBrief;
          this.lastBriefUpdate = now;
          console.log(`[InsightsPanel] Brief generated${result.cached ? ' (cached)' : ''}`);
        }
      } else {
        this.setProgress(2, totalSteps, 'Using cached brief...');
      }

      this.renderInsights(importantClusters, worldBrief);
    } catch (error) {
      console.error('[InsightsPanel] Error:', error);
      this.setContent('<div class="insights-error">Analysis failed - retrying...</div>');
    }
  }

  private renderInsights(
    clusters: ClusteredEvent[],
    worldBrief: string | null
  ): void {
    const briefHtml = worldBrief ? this.renderWorldBrief(worldBrief) : '';
    const breakingHtml = this.renderBreakingStories(clusters);
    const statsHtml = this.renderStats(clusters);

    this.setContent(`
      ${briefHtml}
      ${statsHtml}
      <div class="insights-section">
        <div class="insights-section-title">BREAKING & CONFIRMED</div>
        ${breakingHtml}
      </div>
    `);
  }

  private renderWorldBrief(brief: string): string {
    // Parse bullet points into proper HTML list
    const lines = brief.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const isBulletList = lines.some(l => /^[-•*]/.test(l) || /^\d+\./.test(l));

    let briefHtml: string;
    if (isBulletList) {
      const items = lines.map(line => {
        const cleaned = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
        return `<li>${escapeHtml(cleaned)}</li>`;
      }).join('');
      briefHtml = `<ul class="insights-brief-list">${items}</ul>`;
    } else {
      briefHtml = `<p class="insights-brief-text">${escapeHtml(brief)}</p>`;
    }

    return `
      <div class="insights-brief">
        <div class="insights-section-title">\u20bf CRYPTO BRIEF</div>
        ${briefHtml}
      </div>
    `;
  }

  private renderBreakingStories(
    clusters: ClusteredEvent[]
  ): string {
    return clusters.map((cluster) => {
      const badges: string[] = [];

      if (cluster.sourceCount >= 3) {
        badges.push(`<span class="insight-badge confirmed">\u2713 ${cluster.sourceCount} sources</span>`);
      } else if (cluster.sourceCount >= 2) {
        badges.push(`<span class="insight-badge multi">${cluster.sourceCount} sources</span>`);
      }

      if (cluster.velocity && cluster.velocity.level !== 'normal') {
        const velIcon = cluster.velocity.trend === 'rising' ? '\u2191' : '';
        badges.push(`<span class="insight-badge velocity ${cluster.velocity.level}">${velIcon}+${cluster.velocity.sourcesPerHour}/hr</span>`);
      }

      if (cluster.isAlert) {
        badges.push('<span class="insight-badge alert">\u26a0 ALERT</span>');
      }

      const link = cluster.primaryLink || cluster.topSources?.[0]?.url || '';
      const titleHtml = link
        ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="insight-story-link">${escapeHtml(cluster.primaryTitle.slice(0, 100))}${cluster.primaryTitle.length > 100 ? '...' : ''}</a>`
        : `<span class="insight-story-title">${escapeHtml(cluster.primaryTitle.slice(0, 100))}${cluster.primaryTitle.length > 100 ? '...' : ''}</span>`;

      return `
        <div class="insight-story">
          <div class="insight-story-header">
            <span class="insight-sentiment-dot neutral"></span>
            ${titleHtml}
          </div>
          ${badges.length > 0 ? `<div class="insight-badges">${badges.join('')}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  private renderStats(clusters: ClusteredEvent[]): string {
    const multiSource = clusters.filter(c => c.sourceCount >= 2).length;
    const fastMoving = clusters.filter(c => c.velocity && c.velocity.level !== 'normal').length;
    const alerts = clusters.filter(c => c.isAlert).length;

    return `
      <div class="insights-stats">
        <div class="insight-stat">
          <span class="insight-stat-value">${multiSource}</span>
          <span class="insight-stat-label">Multi-source</span>
        </div>
        <div class="insight-stat">
          <span class="insight-stat-value">${fastMoving}</span>
          <span class="insight-stat-label">Fast-moving</span>
        </div>
        ${alerts > 0 ? `
        <div class="insight-stat alert">
          <span class="insight-stat-value">${alerts}</span>
          <span class="insight-stat-label">Alerts</span>
        </div>
        ` : ''}
      </div>
    `;
  }
}
