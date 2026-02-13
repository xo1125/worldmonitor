/**
 * News clustering service - main thread wrapper.
 * Core logic is in analysis-core.ts (shared with worker).
 * Hybrid clustering combines Jaccard + semantic similarity when ML is available.
 */

import type { NewsItem, ClusteredEvent } from '@/types';
import { getSourceTier } from '@/config';
import { clusterNewsCore } from './analysis-core';

export function clusterNews(items: NewsItem[]): ClusteredEvent[] {
  return clusterNewsCore(items, getSourceTier) as ClusteredEvent[];
}

/**
 * Hybrid clustering: Jaccard-based clustering
 * ML semantic refinement removed (ml-worker deleted in crypto-only build)
 */
export async function clusterNewsHybrid(items: NewsItem[]): Promise<ClusteredEvent[]> {
  return clusterNewsCore(items, getSourceTier) as ClusteredEvent[];
}
