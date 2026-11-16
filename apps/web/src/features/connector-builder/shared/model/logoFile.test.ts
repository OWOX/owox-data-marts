import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_LOGO_BYTES, readLogoFile } from './logoFile';

const svg = (body: string) => new File([body], 'logo.svg', { type: 'image/svg+xml' });

describe('readLogoFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps an SVG as it is', async () => {
    const body = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect(await readLogoFile(svg(body))).toBe(`data:image/svg+xml;base64,${btoa(body)}`);
  });

  it('refuses an SVG that does not fit the logo column', async () => {
    await expect(readLogoFile(svg('x'.repeat(MAX_LOGO_BYTES)))).rejects.toThrow(
      'logo.svg is too large for an icon'
    );
  });

  it('refuses a file that is not an image it accepts', async () => {
    const gif = new File(['GIF89a'], 'logo.gif', { type: 'image/gif' });
    await expect(readLogoFile(gif)).rejects.toThrow(
      'logo.gif is not an SVG, PNG, JPEG or WebP image.'
    );
  });

  it('scales a raster image into a centred 128 px square PNG', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 512, height: 256, close })
    );
    const drawImage = vi.fn();
    const canvases: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement
    ) {
      canvases.push(this);
      return { drawImage } as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext']);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AAAA'
    );

    const png = new File(['png'], 'logo.png', { type: 'image/png' });

    expect(await readLogoFile(png)).toBe('data:image/png;base64,AAAA');
    expect(canvases[0].width).toBe(128);
    expect(canvases[0].height).toBe(128);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 32, 128, 64);
    expect(close).toHaveBeenCalled();
  });

  it('keeps a small raster image at its size', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 32, height: 32, close: vi.fn() })
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AAAA'
    );

    await readLogoFile(new File(['png'], 'logo.png', { type: 'image/png' }));

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 32, 32);
  });

  it('refuses a raster file the browser cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')));
    const broken = new File(['nope'], 'logo.jpg', { type: 'image/jpeg' });
    await expect(readLogoFile(broken)).rejects.toThrow('Could not read logo.jpg as an image.');
  });
});
