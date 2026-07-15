import type { CSSProperties } from 'react';

export const NODE_BORDER_COLOR = '#9ca3af';
export const HIGHLIGHT_COLOR = '#3b82f6';
export const WARNING_COLOR = '#f97316';
export const EDGE_COLOR = 'steelblue';
export const EDGE_STROKE_WIDTH = 1.5;
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

export const NODE_PULSE_KEYFRAMES = `
  @keyframes node-pulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25), 0 0 12px rgba(59, 130, 246, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.15), 0 0 20px rgba(59, 130, 246, 0.5); }
  }
`;
