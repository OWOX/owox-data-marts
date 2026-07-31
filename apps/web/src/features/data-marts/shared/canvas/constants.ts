import type { CSSProperties } from 'react';
import { OWOX_BLUE_BASE, OWOX_GRAY_LIGHT, OWOX_ORANGE_BASE } from './owox-palette';

export const NODE_BORDER_COLOR = OWOX_GRAY_LIGHT;
export const HIGHLIGHT_COLOR = OWOX_BLUE_BASE;
export const WARNING_COLOR = OWOX_ORANGE_BASE;
export const EDGE_COLOR = 'steelblue';
/** OWOX brand blue (--primary / brand-blue-500), resolved to sRGB for SVG strokes + markers. */
export const OWOX_BLUE = '#0084ff';
/** Resting edge color (corporate gray) — edges turn blue only when selected. */
export const EDGE_NEUTRAL_COLOR = OWOX_GRAY_LIGHT;
export const EDGE_STROKE_WIDTH = 1.5;
export const EDGE_SELECTED_STROKE_WIDTH = 2.5;
export const EDGE_WARNING_DASH = '8 4';
export const DIMMED_OPACITY = 0.15;

export const SOCKET_STYLE: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: NODE_BORDER_COLOR,
  border: '2px solid var(--background)',
};

// React Flow sets inline pointer-events:none on nodes that are neither draggable nor selectable
export const STATIC_NODE_STYLE: CSSProperties = {
  pointerEvents: 'all',
  cursor: 'default',
};

// Pulse ring in the corporate blue (#4286DE = rgb(66, 134, 222)).
export const NODE_PULSE_KEYFRAMES = `
  @keyframes node-pulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(66, 134, 222, 0.25), 0 0 12px rgba(66, 134, 222, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(66, 134, 222, 0.15), 0 0 20px rgba(66, 134, 222, 0.5); }
  }
`;
