import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getConfig } from './env-config.js';
import {
  toTitleCase,
  normalizePathSeparators,
  normalizePathToKebabCase,
  normalizePathToKebabCaseForURL,
  normalizePrefixForLocalLinkPath,
  isLocalLinkPathInSameDirectory,
} from './utils.js';

// CONFIGURATION
const APP_LOCATION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MONOREPO_ROOT = path.resolve(APP_LOCATION, '../..');
const CONTENT_DEST_PATH = path.join(APP_LOCATION, 'src/content/docs');
const ASSETS_DEST_PATH = path.join(APP_LOCATION, 'src/assets');
const ROOT_CONTENT_INDEX_FILE = path.join(CONTENT_DEST_PATH, 'index.md');
const BASE_URL = getConfig().base;

/**
 * Main sync function that orchestrates the entire process
 */
async function syncDocs() {
  console.log('🔄 Starting documentation sync...');

  // 1. Clear previos results and setup directories
  prepareFileSystem();

  // 2. Find all markdown files
  const sourceFiles = await findMarkdownFiles();

  console.log(`📄 Processing ${sourceFiles.length} files...`);

  // 3. Process each file
  for (const sourceFilePath of sourceFiles) {
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

  console.log(`✅ Documentation sync completed successfully!`);
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
 * Finds all markdown files in the monorepo based on search patterns
 * @returns {Promise<string[]>} - Array of absolute paths to markdown files
 */
async function findMarkdownFiles() {
  const searchPatterns = [
    'apps/**/*.md',
    '*.md',
    'docs/**/*.md',
    'packages/**/*.md',
    'licenses/**/*.md',
  ];
  const ignorePatterns = ['apps/docs/src/**', '**/node_modules/**', 'apps/web/src/**'];

  const sourceFiles = await glob(searchPatterns, {
    cwd: MONOREPO_ROOT,
    ignore: ignorePatterns,
    absolute: true,
  });

  return sourceFiles;
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
      const destImageUrl = normalizePathSeparators(
        path.relative(filePaths.destinationPath, destImageAbsPath).substring(3) // delete first '../'
      );

      // Copy image
      fs.mkdirSync(path.dirname(destImageAbsPath), { recursive: true });
      fs.copyFileSync(sourceImageAbsPath, destImageAbsPath);

      // Replace a relative path on absolute
      fileContent = fileContent.replace(fullMatch, `![${altText}](${destImageUrl})`);
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
    if (filePaths.destinationPath === ROOT_CONTENT_INDEX_FILE && linkText === 'Source Code') {
      normalizedLinkPath = 'https://github.com/OWOX/owox-data-marts/tree/main/' + originalLinkPath;
    } else if (originalLinkPath.startsWith('#')) {
      normalizedLinkPath = originalLinkPath;
    } else {
      normalizedLinkPath = normalizePathToKebabCaseForURL(originalLinkPath).replace(/\.md/, '');
      normalizedLinkPath = normalizePrefixForLocalLinkPath(normalizedLinkPath);

      if (isLocalLinkPathInSameDirectory(normalizedLinkPath)) {
        // convert to absolute path and add base path on site
        normalizedLinkPath =
          BASE_URL +
          '/' +
          normalizePathToKebabCaseForURL(path.dirname(filePaths.relativePath)) +
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
          normalizePathToKebabCaseForURL(filePaths.sourcePath).includes('connectors/src/sources')
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

// Execute the sync process
syncDocs().catch(error => {
  console.error('❌ An error occurred during sync:', error);

  process.exit(1);
});
