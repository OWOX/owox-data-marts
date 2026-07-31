/**
 * OWOX corporate color palette (source: owox-models `colors/Sheet1.html`,
 * the design team's Google Sheet export). Seven scales, index 0 is the base
 * (darkest) shade and higher indexes get progressively lighter.
 *
 * Canvas features must pick colors from here instead of Tailwind defaults.
 */
export const OWOX_PALETTE = {
  gray: ['#000000', '#2C2C2C', '#606060', '#C5C5C5', '#E6E6E6', '#F7F7F7'],
  blue: ['#4286DE', '#609DE4', '#86B5EA', '#CEE2F7', '#E6F0FA', '#F2F7FC'],
  green: ['#6ABA5C', '#84C77A', '#A0D49A', '#D9EED7', '#ECF7EA', '#F5FBF5'],
  yellow: ['#F5C344', '#F7CF58', '#F9DA7B', '#FCF1C9', '#FEF7E3', '#FEFBF1'],
  orange: ['#E9883C', '#ED9F5C', '#F0B782', '#F8E1CA', '#FBEFE3', '#FDF6F0'],
  red: ['#E15241', '#E57164', '#EA938A', '#F6D4D0', '#FAE8E6', '#FCF3F2'],
  purple: ['#9F4DB6', '#B06FC4', '#C393D2', '#E7D4ED', '#F3E9F6', '#F9F4FB'],
} as const;

export const OWOX_BLUE_BASE = OWOX_PALETTE.blue[0];
export const OWOX_GREEN_BASE = OWOX_PALETTE.green[0];
export const OWOX_YELLOW_BASE = OWOX_PALETTE.yellow[0];
export const OWOX_ORANGE_BASE = OWOX_PALETTE.orange[0];
export const OWOX_RED_BASE = OWOX_PALETTE.red[0];
export const OWOX_PURPLE_BASE = OWOX_PALETTE.purple[0];
export const OWOX_GRAY_LIGHT = OWOX_PALETTE.gray[3];
/** Meaning-carrying strokes (edges, borders, handles) need ≥3:1 on white — gray[3] fails WCAG 1.4.11. */
export const OWOX_GRAY_DARK = OWOX_PALETTE.gray[2];
