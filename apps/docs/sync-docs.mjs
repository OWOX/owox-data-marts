import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * CONFIGURATION
 */
const SCRIPT_LOCATION = path.dirname(fileURLToPath(import.meta.url)); // Абсолютний шлях до папки зі скриптом
const MONOREPO_ROOT = path.resolve(SCRIPT_LOCATION, '../..');
const CONTENT_DEST_PATH = path.join(SCRIPT_LOCATION, 'src/content/docs');
const ASSETS_DEST_PATH = path.join(SCRIPT_LOCATION, 'public/content-assets');
const ASSETS_URL_PREFIX = '/content-assets';
const rootContentIndexFile = path.join(CONTENT_DEST_PATH, 'index.md');

/**
 * Converts string to Title Case, handling special cases like OWOX
 * @param {string} str - Input string
 * @returns {string} - Title cased string
 */
function toTitleCase(str) {
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
function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Handle PascalCase and camelCase
    .replace(/[_\s]+/g, '-') // Handle snake_case and spaces
    .toLowerCase()
    .replace(/-+/g, '-') // Remove multiple dashes
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
}

/**
 * Normalizes file path to kebab-case for all path segments
 * @param {string} filePath - Original file path
 * @returns {string} - Normalized path in kebab-case
 */
function normalizePathToKebabCase(filePath) {
  const parsedPath = path.parse(filePath);

  const normalizedDir = parsedPath.dir
    .split(path.sep)
    .map(dirPart => (dirPart ? toKebabCase(dirPart) : dirPart))
    .join(path.sep);

  const normalizedName = toKebabCase(parsedPath.name);

  return path.join(normalizedDir, normalizedName + parsedPath.ext);
}

/**
 * Cleans and creates necessary directories for content and assets
 */
function prepareFileSystem() {
  fs.rmSync(CONTENT_DEST_PATH, { recursive: true, force: true });
  fs.rmSync(ASSETS_DEST_PATH, { recursive: true, force: true });
  fs.mkdirSync(CONTENT_DEST_PATH, { recursive: true });
  fs.mkdirSync(ASSETS_DEST_PATH, { recursive: true });
}

/**
 * Processes image links in markdown content, copying images and updating paths
 * @param {string} fileContent - Markdown content
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 * @returns {string} - Updated markdown content with processed image links
 */
function processImageLinks(fileContent, filePaths) {
  const imageRegex = /!\[(.*?)\]\((?!https?:\/\/)(.*?)\)/g;

  let match;
  while ((match = imageRegex.exec(fileContent)) !== null) {
    const [fullMatch, altText, originalImagePath] = match;

    // Find an absolute path for original image
    const sourceImageAbsPath = path.resolve(path.dirname(filePaths.sourcePath), originalImagePath);
    if (fs.existsSync(sourceImageAbsPath)) {
      // Create a new path for the image while preserving the structure
      const relativeImagePath = path.relative(MONOREPO_ROOT, sourceImageAbsPath);
      const normalizedImagePath = normalizePathToKebabCase(relativeImagePath);
      const destImageAbsPath = path.join(ASSETS_DEST_PATH, normalizedImagePath);
      const destImageUrl = path.join(ASSETS_URL_PREFIX, normalizedImagePath).replace(/\\/g, '/');

      // Copy image
      fs.mkdirSync(path.dirname(destImageAbsPath), { recursive: true });
      fs.copyFileSync(sourceImageAbsPath, destImageAbsPath);

      // Replace a relative path on absolute
      fileContent = fileContent.replace(fullMatch, `![${altText}](${destImageUrl})`);
      // fileContent = fileContent.replace(originalImagePath, destImageUrl);
    }
  }

  return fileContent;
}

/**
 * Processes document links in markdown content, normalizing and updating paths
 * @param {string} fileContent - Markdown content
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 * @returns {string} - Updated markdown content with processed document links
 */
function processDocumentLinks(fileContent, filePaths) {
  const linkRegex = /(?<!!)\[([^\]]*?)\]\((?!https?:\/\/)([^)]*?)\)/g;

  let match;
  while ((match = linkRegex.exec(fileContent)) !== null) {
    const [fullMatch, linkText, originalLinkPath] = match;

    let normalizedLinkPath;
    if (filePaths.destinationPath === rootContentIndexFile && linkText === 'Source Code') {
      normalizedLinkPath = 'https://github.com/OWOX/owox-data-marts/tree/main/' + originalLinkPath;
    } else if (originalLinkPath.startsWith('#')) {
      normalizedLinkPath = originalLinkPath;
    } else {
      normalizedLinkPath = normalizePathToKebabCase(originalLinkPath)
        .replace(/\\/g, '/')
        .replace(/\.md/, '');

      normalizedLinkPath = normalizePrefixForLocalLinkPath(normalizedLinkPath);

      if (shouldConvertToAbsoluteLinkPath(normalizedLinkPath)) {
        normalizedLinkPath =
          '/' +
          normalizePathToKebabCase(path.dirname(filePaths.relativePath)).replace(/\\/g, '/') +
          normalizedLinkPath.substring(1);
      }
    }

    fileContent = fileContent.replace(fullMatch, `[${linkText}](${normalizedLinkPath})`);
  }

  return fileContent;
}

/**
 * Processes frontmatter metadata, extracting titles and setting default values
 * @param {string} fileContent - Markdown content with frontmatter
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 * @returns {string} - Updated markdown content with processed frontmatter
 */
function processFrontmatter(fileContent, filePaths) {
  const { data: frontmatter, content: markdownBody } = matter(fileContent);

  if (!frontmatter.title) {
    const h1Match = markdownBody.match(/^#\s+(.*)/m);

    // Add title from H1 ...
    if (h1Match && h1Match[1]) {
      frontmatter.title = h1Match[1];

      // Delete H1 from content
      fileContent = fileContent.replace(h1Match[0], '').trim();
    } else {
      // ... or generate by filename / dirname and add order
      const fileName = normalizePathToKebabCase(path.parse(filePaths.sourcePath).name);
      const folderName = normalizePathToKebabCase(
        path.basename(path.dirname(filePaths.sourcePath))
      );

      const titleParts = [];
      if (fileName === 'readme' || fileName === 'index') {
        titleParts.push(toTitleCase(folderName));

        frontmatter.sidebar = { order: 0 };
      } else {
        titleParts.push(toTitleCase(fileName));

        if (
          normalizePathToKebabCase(filePaths.sourcePath)
            .replace(/\\/g, '/')
            .includes('connectors/src/sources')
        ) {
          frontmatter.sidebar = { order: fileName === 'getting-started' ? 1 : 2 };
        }
      }

      frontmatter.title = titleParts.join(' ') || 'Document';
    }
  }

  // Add default metadata if not exist
  frontmatter.description =
    frontmatter.description || `Documentation for ${filePaths.relativePath}`;
  frontmatter.template = frontmatter.template || 'doc';

  return matter.stringify(fileContent, frontmatter);
}

/**
 * Normalizes link path prefix based on path structure
 * @param {string} linkPath - Link path to normalize
 * @returns {string} - Normalized link path with appropriate prefix
 */
function normalizePrefixForLocalLinkPath(linkPath) {
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
 * Defines and normalizes file paths for processing
 * @param {string} sourcePath - Absolute path to source file
 * @returns {Object} - Object containing sourcePath, relativePath, and destinationPath
 */
function defineFilePaths(sourcePath) {
  // Get a relative path to preserve the structure
  const relativePath = path.relative(MONOREPO_ROOT, sourcePath);

  const normalizedRelativePath = normalizePathToKebabCase(relativePath);

  const destinationPath = path.join(
    CONTENT_DEST_PATH,
    normalizedRelativePath === 'readme.md' ? 'index.md' : normalizedRelativePath
  );

  return {
    sourcePath,
    relativePath,
    destinationPath,
  };
}

/**
 * Checks if a relative path should be converted to absolute
 * @param {string} linkPath - Normalized path
 * @returns {boolean} - Whether to convert to absolute path
 */
function shouldConvertToAbsoluteLinkPath(linkPath) {
  return (
    linkPath.startsWith('./') &&
    linkPath !== './.' &&
    linkPath !== './' &&
    linkPath !== '.' &&
    linkPath.split('/').length === 2
  );
}

/**
 * Finds all markdown files in the monorepo based on search patterns
 * @returns {Promise<string[]>} - Array of absolute paths to markdown files
 */
async function findMarkdownFiles() {
  const searchPatterns = ['apps/**/*.md', '*.md', 'docs/**/*.md', 'packages/**/*.md'];
  const ignorePatterns = ['apps/docs/src/**', '**/node_modules/**', 'apps/web/src/**'];

  const sourceFiles = await glob(searchPatterns, {
    cwd: MONOREPO_ROOT,
    ignore: ignorePatterns,
    absolute: true,
  });

  return sourceFiles;
}

/**
 * Main sync function that orchestrates the entire process
 */
async function syncDocs() {
  // eslint-disable-next-line no-undef
  console.log('🔄 Starting documentation sync...');

  // 1. Clear previos results and setup directories
  prepareFileSystem();

  // 2. Find all markdown files
  const sourceFiles = await findMarkdownFiles();

  // eslint-disable-next-line no-undef
  console.log(`📄 Processing ${sourceFiles.length} files...`);

  // 3. Process each file
  for (const sourceFilePath of sourceFiles) {
    // eslint-disable-next-line no-undef
    console.log(`Processing: ${path.relative(MONOREPO_ROOT, sourceFilePath)}`);

    // 3.1 Prepare file paths and read the content
    const filePaths = defineFilePaths(sourceFilePath);
    fs.mkdirSync(path.dirname(filePaths.destinationPath), { recursive: true });

    let fileContent = fs.readFileSync(filePaths.sourcePath, 'utf-8');

    // 3.2. Find, copy, and replace image paths
    fileContent = processImageLinks(fileContent, filePaths);

    // 3.3. Find and replace paths to other file links
    fileContent = processDocumentLinks(fileContent, filePaths);

    // 3.4. Frontmatter
    fileContent = processFrontmatter(fileContent, filePaths);

    fs.writeFileSync(filePaths.destinationPath, fileContent);
  }

  // eslint-disable-next-line no-undef
  console.log(`✅ Documentation sync completed successfully!`);
}

// Execute the sync process
syncDocs().catch(error => {
  // eslint-disable-next-line no-undef
  console.error('❌ An error occurred during sync:', error);

  // eslint-disable-next-line no-undef
  process.exit(1);
});
