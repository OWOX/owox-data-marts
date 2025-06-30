import path from 'node:path';

/**
 * Converts string to Title Case, handling special cases like OWOX
 * @param {string} str - Input string
 * @returns {string} - Title cased string
 */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1))
    .replace('Owox', 'OWOX');
}

/**
 * Converts string to kebab-case
 * @param {string} str - Input string
 * @returns {string} - Kebab-cased string
 */
export function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Handle PascalCase and camelCase
    .replace(/[_\s]+/g, '-') // Handle snake_case and spaces
    .toLowerCase()
    .replace(/-+/g, '-') // Remove multiple dashes
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
}

/**
 * Normalizes a file path by replacing all backslashes (`\`) with forward slashes (`/`).
 * This is useful for ensuring path consistency across different operating systems
 * (like Windows and POSIX-based systems) and for web contexts.
 *
 * @param {string} filePath The file path to normalize (e.g., 'C:\\Users\\Test\\file.js').
 * @returns {string} The normalized path with forward slashes (e.g., 'C:/Users/Test/file.js').
 *
 * @example
 * const windowsPath = 'src\\components\\Button.js';
 * const normalized = normalizePath(windowsPath);
 * // `normalized` is now 'src/components/Button.js'
 */
export function normalizePathSeparators(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Normalizes file path to kebab-case for all path segments
 * @param {string} filePath - Original file path
 * @returns {string} - Normalized path in kebab-case
 */
export function normalizePathToKebabCase(filePath) {
  const parsedPath = path.parse(filePath);

  const normalizedDir = parsedPath.dir
    .split(path.sep)
    .map(dirPart => (dirPart ? toKebabCase(dirPart) : dirPart))
    .join(path.sep);

  const normalizedName = toKebabCase(parsedPath.name);

  return path.join(normalizedDir, normalizedName + parsedPath.ext);
}

/**
 * Normalizes file path to kebab-case for all path segments and normalies separators
 * by replacing all backslashes (`\`) with forward slashes (`/`)
 *
 * @param {string} filePath - Original file path
 * @returns {string} - Normalized path in kebab-case
 */
export function normalizePathToKebabCaseForURL(filePath) {
  return normalizePathSeparators(normalizePathToKebabCase(filePath));
}

/**
 * Normalizes link path prefix based on path structure.
 * Local link prefix must started with "./"
 * @param {string} linkPath - Link path to normalize
 * @returns {string} - Normalized link path with appropriate prefix
 */
export function normalizePrefixForLocalLinkPath(linkPath) {
  let preffix = '';
  if (linkPath.startsWith('/')) {
    preffix = '.';
  } else if (linkPath.startsWith('./') || linkPath.startsWith('../')) {
    preffix = '';
  } else {
    preffix = './';
  }

  return preffix + linkPath;
}

/**
 * Checks if a relative path is a local link path in same directory
 * @param {string} linkPath - Normalized path
 * @returns {boolean} - Result yes or no
 */
export function isLocalLinkPathInSameDirectory(linkPath) {
  return (
    linkPath.startsWith('./') &&
    linkPath !== './.' &&
    linkPath !== './' &&
    linkPath.split('/').length === 2
  );
}
