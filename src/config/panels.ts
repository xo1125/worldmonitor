import type { PanelConfig, MapLayers } from '@/types';

// Re-export from crypto variant (the only variant)
import {
  DEFAULT_PANELS as CRYPTO_PANELS,
  DEFAULT_MAP_LAYERS as CRYPTO_MAP_LAYERS,
  MOBILE_DEFAULT_MAP_LAYERS as CRYPTO_MOBILE_MAP_LAYERS,
} from './variants/crypto';

export const DEFAULT_PANELS: Record<string, PanelConfig> = CRYPTO_PANELS;
export const DEFAULT_MAP_LAYERS: MapLayers = CRYPTO_MAP_LAYERS;
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = CRYPTO_MOBILE_MAP_LAYERS;
