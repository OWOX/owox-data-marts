import { getNodesBounds, type Node } from '@xyflow/react';
import { toCanvas, toSvg } from 'html-to-image';

// Image export captures the React Flow viewport element with an overridden
// transform, so the whole model renders at 1:1 regardless of the user's
// current pan/zoom. React Flow nodes are HTML, which html-to-image wraps in an
// SVG <foreignObject>; rasterizing that (the PNG path) can hit Chromium's
// canvas-tainting rules when any resource fails to inline, so PNG failures
// must surface as a catchable error rather than a hung promise.

const PAD = 60; // px of breathing room around the model
const PNG_PIXEL_RATIO = 2;
// Browsers cap canvas dimensions and total area (Safari is the strictest);
// past the cap toBlob silently yields null. Large models trade resolution for
// a canvas that stays comfortably inside those limits.
const MAX_PNG_AREA = 67_108_864; // output pixels, an 8192×8192 equivalent
const WM_SIZE = 24;
const WM_INSET = 14;

function pngPixelRatio(width: number, height: number): number {
  const maxRatio = Math.sqrt(MAX_PNG_AREA / (width * height));
  return Math.max(1, Math.min(PNG_PIXEL_RATIO, maxRatio));
}

// OWOX logo paths (512 viewBox), scaled down inside the watermark.
const LOGO_P0 =
  'M421.311 119.85C435.258 133.807 440.996 157.327 440.996 157.327C440.996 157.327 449.53 204.69 449.53 268.995C449.53 177.972 418.65 162.348 311.314 162.348H212.327C157.38 162.348 161.097 217.57 157.38 243.85L152.865 283.556C150.697 325.33 157.951 351.215 200.811 351.215C111.444 351.215 61.806 365.847 61.8062 239.866C61.8061 182.846 70.4043 157.327 70.4043 157.327C70.4043 157.327 76.1419 133.807 90.1183 119.85C104.095 105.877 124.809 104.475 124.809 104.475C124.809 104.475 167.579 98.0374 252.066 98.0374C336.554 98.0374 384.285 104.475 384.285 104.475C384.285 104.475 407.321 105.877 421.311 119.85Z';
const LOGO_P1 =
  'M449.515 271.888C449.52 273.026 449.523 274.174 449.523 275.333C449.523 329.946 441.393 351.201 441.393 351.201C441.393 351.201 435.03 376.952 424.167 388.075C406.929 405.725 388.495 406.71 388.495 406.71C388.495 406.71 348.836 413.061 263.502 413.061C181.632 413.061 127.111 406.749 127.111 406.749C127.111 406.749 104.091 405.337 90.1144 391.377C76.1379 377.394 70.4004 351.201 70.4004 351.201C70.4004 351.201 61.8062 297.401 61.8062 238.506C61.806 352.055 102.131 351.374 175.525 350.133C183.56 349.998 191.992 349.855 200.811 349.855H299.787C343.122 349.855 352.906 318.315 354.792 282.196L359.32 227.093C360.526 204.443 357.608 188.362 350.507 178.012C342.765 166.722 329.575 160.987 311.314 160.987C424.974 160.987 448.73 176.216 449.515 271.888Z';

function watermarkInner(): string {
  const logoScale = WM_SIZE / 512;
  return (
    '<defs>' +
    '<linearGradient id="wmg0" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#05D2FF"/><stop offset=".4" stop-color="#1E88E5"/><stop offset="1" stop-color="#182FFF"/></linearGradient>' +
    '<linearGradient id="wmg1" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#24D8FF"/><stop offset=".4" stop-color="#1E88E5"/><stop offset="1" stop-color="#0046F9"/></linearGradient>' +
    '</defs>' +
    `<g transform="scale(${String(logoScale)})"><path d="${LOGO_P0}" fill="url(#wmg0)"/><path d="${LOGO_P1}" fill="url(#wmg1)"/></g>`
  );
}

function watermarkGroup(x: number, y: number): string {
  return `<g transform="translate(${String(x)},${String(y)})" opacity="0.92">${watermarkInner()}</g>`;
}

function captureOptions(rfNodes: Node[]) {
  const bounds = getNodesBounds(rfNodes);
  const width = Math.ceil(bounds.width) + PAD * 2;
  const height = Math.ceil(bounds.height) + PAD * 2;
  // Translate so the model's top-left lands at (PAD, PAD); no scaling (1:1).
  const transform = `translate(${String(PAD - bounds.x)}px, ${String(PAD - bounds.y)}px) scale(1)`;
  return {
    width,
    height,
    style: { width: `${String(width)}px`, height: `${String(height)}px`, transform },
  };
}

/**
 * The page background the exported image should sit on: the nearest opaque
 * ancestor background, so dark theme exports stay readable outside the app.
 */
export function resolveCanvasBackground(element: HTMLElement): string {
  let current: HTMLElement | null = element;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (color && color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) return color;
    current = current.parentElement;
  }
  return '#ffffff';
}

/** Export the model as an SVG file with the OWOX watermark bottom-right. */
export async function exportCanvasSvg(
  viewport: HTMLElement,
  rfNodes: Node[],
  background: string
): Promise<Blob> {
  const { width, height, style } = captureOptions(rfNodes);
  const dataUrl = await toSvg(viewport, { width, height, style, skipFonts: true });
  const raw = decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
  // The background must be a child <rect>, not a fill on the captured element:
  // html-to-image would paint that fill on the translated viewport, offsetting it.
  const withBackground = raw.replace(
    /(<svg[^>]*>)/,
    `$1<rect width="100%" height="100%" fill="${background}"/>`
  );
  const watermark = watermarkGroup(width - WM_SIZE - WM_INSET, height - WM_SIZE - WM_INSET);
  const withWatermark = withBackground.replace(/<\/svg>\s*$/, `${watermark}</svg>`);
  return new Blob([withWatermark], { type: 'image/svg+xml' });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error('Failed to load watermark image'));
    };
    image.src = source;
  });
}

/** Export the model as a PNG at up to {@link PNG_PIXEL_RATIO}x scale. */
export async function exportCanvasPng(
  viewport: HTMLElement,
  rfNodes: Node[],
  background: string
): Promise<Blob> {
  const { width, height, style } = captureOptions(rfNodes);
  const pixelRatio = pngPixelRatio(width, height);
  const captured = await toCanvas(viewport, {
    width,
    height,
    style,
    skipFonts: true,
    pixelRatio,
  });

  // Composite onto a fresh canvas: background fill first (see the SVG note on
  // why html-to-image's own backgroundColor option cannot be used), then the
  // capture, then the watermark rendered from a standalone SVG.
  const output = document.createElement('canvas');
  output.width = Math.round(width * pixelRatio);
  output.height = Math.round(height * pixelRatio);
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.fillStyle = background;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(captured, 0, 0, output.width, output.height);

  const watermarkSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(WM_SIZE)}" height="${String(WM_SIZE)}" ` +
    `viewBox="0 0 ${String(WM_SIZE)} ${String(WM_SIZE)}" opacity="0.92">${watermarkInner()}</svg>`;
  const watermarkImage = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(watermarkSvg)}`
  );
  const wmScaled = WM_SIZE * pixelRatio;
  context.drawImage(
    watermarkImage,
    output.width - wmScaled - WM_INSET * pixelRatio,
    output.height - wmScaled - WM_INSET * pixelRatio,
    wmScaled,
    wmScaled
  );

  const blob = await new Promise<Blob | null>(resolve => {
    output.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('PNG rasterization produced no data');
  return blob;
}
