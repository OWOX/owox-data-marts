import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_LOGO_BYTES, readLogoFile } from './logoFile';

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg">';
const svg = (body: string) => new File([body], 'logo.svg', { type: 'image/svg+xml' });
const png = () => new File(['png'], 'logo.png', { type: 'image/png' });

/** Stands in for the browser's decode and canvas, which happy-dom does not implement. */
function stubRaster(width: number, height: number, dataUrl = 'data:image/png;base64,AAAA') {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  const drawImage = vi.fn();
  const canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    canvases.push(this);
    return { drawImage } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
  return { close, drawImage, canvases, toDataURL };
}

describe('readLogoFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps an SVG as it is', async () => {
    const body = `${SVG_OPEN}<rect width="4" height="4"/></svg>`;
    expect(await readLogoFile(svg(body))).toBe(`data:image/svg+xml;base64,${btoa(body)}`);
  });

  it.each([
    ['an empty file', ''],
    ['an SVG without the SVG namespace', '<svg><rect width="4" height="4"/></svg>'],
    ['malformed XML', `${SVG_OPEN}<rect></svg>`],
    ['another XML document', '<html xmlns="http://www.w3.org/1999/xhtml"/>'],
  ])('refuses %s as an SVG', async (_, body) => {
    await expect(readLogoFile(svg(body))).rejects.toThrow(
      'logo.svg is not an SVG image that a browser can show.'
    );
  });

  it('refuses an SVG that does not fit the logo column', async () => {
    const body = `${SVG_OPEN}<!--${'x'.repeat((MAX_LOGO_BYTES * 3) / 4)}--></svg>`;
    await expect(readLogoFile(svg(body))).rejects.toThrow(
      'logo.svg is too large for an icon. Use an SVG under 48 KB.'
    );
  });

  it('refuses a file that is not an image it accepts', async () => {
    const gif = new File(['GIF89a'], 'logo.gif', { type: 'image/gif' });
    await expect(readLogoFile(gif)).rejects.toThrow(
      'logo.gif is not an SVG, PNG, JPEG or WebP image.'
    );
  });

  it('scales a raster image into a centred 128 px square PNG', async () => {
    const { close, drawImage, canvases, toDataURL } = stubRaster(512, 256);

    expect(await readLogoFile(png())).toBe('data:image/png;base64,AAAA');
    expect(canvases[0].width).toBe(128);
    expect(canvases[0].height).toBe(128);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 32, 128, 64);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(close).toHaveBeenCalled();
  });

  it('keeps a small raster image at its size', async () => {
    const { drawImage } = stubRaster(32, 32);
    await readLogoFile(png());
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 32, 32);
  });

  it('keeps a very thin raster image at least 1 px high', async () => {
    const { drawImage } = stubRaster(1000, 1);
    await readLogoFile(png());
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 63.5, 128, 1);
  });

  it('refuses a raster image that is still too large as a PNG', async () => {
    stubRaster(128, 128, `data:image/png;base64,${'A'.repeat(MAX_LOGO_BYTES)}`);
    await expect(readLogoFile(png())).rejects.toThrow(
      'logo.png has too much detail for an icon. Use a simpler image or an SVG.'
    );
  });

  it('releases the decoded image when the canvas fails', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 8, height: 8, close }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(readLogoFile(png())).rejects.toThrow('Could not read logo.png as an image.');
    expect(close).toHaveBeenCalled();
  });

  it('refuses a raster file the browser cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')));
    const broken = new File(['nope'], 'logo.jpg', { type: 'image/jpeg' });
    await expect(readLogoFile(broken)).rejects.toThrow('Could not read logo.jpg as an image.');
  });
});
