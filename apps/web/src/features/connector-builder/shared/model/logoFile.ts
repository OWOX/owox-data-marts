/** The connector's `logo` column holds at most this many bytes, and a data URI is ASCII. */
export const MAX_LOGO_BYTES = 65535;

const RASTER_SIDE = 128;
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const LOGO_ACCEPT = ['image/svg+xml', ...RASTER_TYPES].join(',');

/**
 * Reads an icon file into the `data:image/...;base64,` URI the connector stores. An SVG is kept
 * as it is; a raster image becomes a PNG of at most 128 × 128 px. Throws an Error whose message
 * is for the user.
 */
export async function readLogoFile(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    if (!isDrawableSvg(await file.text())) {
      throw new Error(`${file.name} is not an SVG image that a browser can show.`);
    }
    const uri = await readAsDataUrl(file);
    if (uri.length > MAX_LOGO_BYTES) {
      throw new Error(`${file.name} is too large for an icon. Use an SVG under 48 KB.`);
    }
    return uri;
  }
  if (RASTER_TYPES.includes(file.type)) {
    const uri = await toSquarePng(file);
    if (uri.length > MAX_LOGO_BYTES) {
      throw new Error(
        `${file.name} has too much detail for an icon. Use a simpler image or an SVG.`
      );
    }
    return uri;
  }
  throw new Error(`${file.name} is not an SVG, PNG, JPEG or WebP image.`);
}

// An <img> shows an SVG only when it is well-formed XML with an <svg> root in the SVG namespace.
function isDrawableSvg(text: string): boolean {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  return (
    root.localName === 'svg' &&
    root.namespaceURI === SVG_NAMESPACE &&
    doc.getElementsByTagName('parsererror').length === 0
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error(`Could not read ${file.name}.`));
    };
    reader.readAsDataURL(file);
  });
}

// Centred in a square: every surface draws the icon with equal width and height.
async function toSquarePng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`Could not read ${file.name} as an image.`);
  });
  try {
    const scale = Math.min(1, RASTER_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const side = Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Could not read ${file.name} as an image.`);
    context.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}
