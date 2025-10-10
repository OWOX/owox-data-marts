// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import Papa from 'papaparse';
import { getConfig } from './env-config.js';
import {
  normalizePathSeparators,
  normalizePathToKebabCase,
  normalizeSuffixForDirectoryStyleURL,
} from './utils.js';

// CONFIGURATION
const APP_LOCATION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS_DEST_PATH = path.join(APP_LOCATION, 'src/assets');
const CONTENT_DEST_PATH = path.join(APP_LOCATION, 'src/content/docs');
const MONOREPO_ROOT = path.resolve(APP_LOCATION, '../..');
const CHANGELOG_PATH = path.join(MONOREPO_ROOT, 'apps/owox/CHANGELOG.md');

/**
 * Main sync function that orchestrates the entire process
 */
async function syncDocs() {
  console.log('🔄 Starting documentation sync...');

  // 1. Clear previos results and setup directories
  prepareFileSystem();

  // 2. Find all markdown files
  await processMarkdownFiles();

  // 4. Process manifests for Connectors
  await processManifests();

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
 * Processes all necessary markdown files
 */
async function processMarkdownFiles() {
  const sourceFiles = await findMarkdownFiles();

  if (sourceFiles.length === 0) {
    console.log('No .md files found.');
    return;
  }

  const metaData = prepareMetadataContent();

  console.log(`📄 Processing ${sourceFiles.length} .md files...`);

  // Process each file
  for (const sourceFilePath of sourceFiles) {
    console.log(`Processing: ${path.relative(MONOREPO_ROOT, sourceFilePath)}`);

    // 1. Prepare file paths and read the content
    const filePaths = defineFilePaths(sourceFilePath);
    fs.mkdirSync(path.dirname(filePaths.destinationPath), { recursive: true });

    let fileContent = fs.readFileSync(filePaths.sourcePath, 'utf-8');

    // 2. Find, copy, and replace image paths
    fileContent = processImageLinks(fileContent, filePaths);

    // 3. Find and replace paths to other file links
    fileContent = processDocumentLinks(fileContent, filePaths);

    // 4. Replace bare GitHub video links on HTML tag
    fileContent = processGithubVideoLinks(fileContent);

    // 5. Frontmatter
    fileContent = processFrontmatter(fileContent, filePaths, metaData);

    fs.writeFileSync(filePaths.destinationPath, fileContent);
  }
}

/**
 * Processes all necessary manifest files to create _meta.yml files for customization groups in sidebar.
 */
async function processManifests() {
  const manifestFiles = await findManifestFiles();

  if (manifestFiles.length === 0) {
    console.log('No manifest.json files found.');
    return;
  }

  console.log(`📄 Processing ${manifestFiles.length} manifest.json files...`);

  for (const manifestPath of manifestFiles) {
    const relativeManifestPath = path.relative(MONOREPO_ROOT, manifestPath);
    console.log(`Processing: ${relativeManifestPath}`);

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifestData = JSON.parse(manifestContent);

    if (!manifestData.title) {
      console.warn(`⚠️ Skipping manifest, no 'title' field found in: ${relativeManifestPath}`);
      continue;
    }

    // Prepare content
    const metaDataObject = { label: manifestData.title, collapsed: true };
    const fileContent = yaml.dump(metaDataObject);

    // Define the destination directory
    const destinationDir = defineFilePaths(path.dirname(manifestPath)).destinationPath;

    // Create the directory if it doesn't exist and write the file.
    fs.mkdirSync(destinationDir, { recursive: true });

    fs.writeFileSync(path.join(destinationDir, '_meta.yml'), fileContent);
  }
}

/**
 * Finds all markdown files in the monorepo based on search patterns
 * @returns {Promise<string[]>} - Array of absolute paths to markdown files
 */
async function findMarkdownFiles() {
  const searchPatterns = [
    '*.md',
    'apps/**/*.md',
    'docs/**/*.md',
    'packages/**/*.md',
    'licenses/**/*.md',
  ];

  const ignorePatterns = [
    '**/node_modules/**',
    '**/CHANGELOG.md',
    'apps/docs/src/**',
    'apps/backend/src/**',
    'apps/web/src/**',
  ];

  const sourceFiles = await glob(searchPatterns, {
    cwd: MONOREPO_ROOT,
    ignore: ignorePatterns,
    absolute: true,
  });

  // Manualy add main Changelog
  if (!sourceFiles.includes(CHANGELOG_PATH) && fs.existsSync(CHANGELOG_PATH)) {
    sourceFiles.push(CHANGELOG_PATH);
  }

  return sourceFiles;
}

/**
 * Finds all manifest.json files in the connectors directories.
 * @returns {Promise<string[]>} - Array of absolute paths to manifest files.
 */
async function findManifestFiles() {
  const searchPatterns = ['packages/connectors/**/manifest.json'];
  const ignorePatterns = ['**/node_modules/**'];

  const manifestFiles = await glob(searchPatterns, {
    cwd: MONOREPO_ROOT,
    ignore: ignorePatterns,
    absolute: true,
  });

  return manifestFiles;
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

  const destinationPath =
    sourcePath === CHANGELOG_PATH
      ? path.join(CONTENT_DEST_PATH, 'docs/changelog.md')
      : path.join(
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
  const baseURL = getConfig().base;
  const rootContentIndexFile = path.join(CONTENT_DEST_PATH, 'index.md');

  const linkRegex = /(?<!!)\[([^\]]*?)\]\((?!https?:\/\/)([^)]*?)\)/g;

  return fileContent.replace(linkRegex, (fullMatch, linkText, originalLinkPath) => {
    let normalizedLinkPath;
    if (filePaths.destinationPath === rootContentIndexFile && linkText === 'Source Code') {
      normalizedLinkPath = 'https://github.com/OWOX/owox-data-marts/tree/main/' + originalLinkPath;
    } else if (originalLinkPath.startsWith('#')) {
      normalizedLinkPath = originalLinkPath;
    } else {
      const absoluteLinkPath = path.join(path.dirname(filePaths.sourcePath), originalLinkPath);
      const relativeLinkPath = path.relative(MONOREPO_ROOT, absoluteLinkPath);
      const normalizedRelativePath = normalizePathToKebabCase(relativeLinkPath);
      const destLinkAbsPath = path.join(CONTENT_DEST_PATH, normalizedRelativePath);
      let destLinkUrl = normalizePathSeparators(path.relative(CONTENT_DEST_PATH, destLinkAbsPath));
      destLinkUrl = destLinkUrl === 'readme.md' ? '' : destLinkUrl;
      destLinkUrl = baseURL + '/' + destLinkUrl.replace(/\.md/, '');

      normalizedLinkPath = normalizeSuffixForDirectoryStyleURL(destLinkUrl)
        .replace('//', '/')
        .replace('/readme/#', '/#');
    }
    return `[${linkText}](${normalizedLinkPath})`;
  });
}

/**
 * Processes GitHub video links in markdown content, converting bare URLs to HTML video tags
 * @param {string} fileContent - Markdown content
 * @returns {string} - Updated markdown content with GitHub video URLs converted to HTML video elements
 */
function processGithubVideoLinks(fileContent) {
  const lines = fileContent.split('\n');

  const processedLines = lines.map(line => {
    // Remove markdownlint comments before checking the URL
    const trimmedLine = line
      .trim()
      .replace(/<!--.*?-->/g, '')
      .trim();
    if (
      trimmedLine.startsWith('<https://github.com/user-attachments/assets/') ||
      trimmedLine.startsWith('https://github.com/user-attachments/assets/')
    ) {
      // Extract clean URL by removing angle brackets if present
      const cleanUrl = trimmedLine.replace(/^<|>$/g, '');
      return `<!-- markdownlint-disable-next-line MD033 MD034 -->
<video controls playsinline muted style="max-width: 100%; height: auto;">
  <!-- markdownlint-disable-next-line MD033 MD034 -->
  <source src="${cleanUrl}" type="video/mp4">
  Your browser does not support the video tag.
</video>`;
    }
    return line;
  });

  return processedLines.join('\n');
}

/**
 * Processes frontmatter metadata by orchestrating title, sidebar, and meta info processing
 * @param {string} fileContent - Markdown content with frontmatter
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 * @param {Array<Object>} metaData - Array of metadata objects from CSV containing page-specific meta information
 * @returns {string} - Updated markdown content with processed frontmatter
 */
function processFrontmatter(fileContent, filePaths, metaData) {
  const { data: frontmatter, content: markdownBody } = matter(fileContent);

  // 1. Title
  fileContent = processFrontmatterTitle(frontmatter, markdownBody, fileContent, filePaths);

  // 2. Sidebar
  processFrontmatterSidebar(frontmatter, filePaths);

  // 3. Add meta content data to HEAD tag
  processFrontmatterMetaInfo(frontmatter, metaData, filePaths);

  return matter.stringify(fileContent, frontmatter);
}

/**
 * Extracts and sets the title in frontmatter, either from existing frontmatter, H1 heading, or default value
 * @param {Object} frontmatter - Frontmatter object to be updated
 * @param {string} markdownBody - Markdown content without frontmatter
 * @param {string} fileContent - Full markdown content
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 * @returns {string} - Updated markdown content with H1 removed if it was used for title
 */
function processFrontmatterTitle(frontmatter, markdownBody, fileContent, filePaths) {
  const { sourcePath } = filePaths;

  if (!frontmatter.title) {
    const h1Match = markdownBody.match(/^#\s+(.*)/m);
    // Add title from H1 ...
    if (h1Match && h1Match[1]) {
      frontmatter.title = h1Match[1];
      // Delete H1 from content
      fileContent = fileContent.replace(h1Match[0], '').trim();
    } else {
      // Default title
      frontmatter.title = 'Document';
    }
  }

  // Check changelog
  if (sourcePath === CHANGELOG_PATH) {
    frontmatter.title = 'Changelog';
  }

  return fileContent;
}

/**
 * Sets sidebar configuration in frontmatter based on the destination filename
 * @param {Object} frontmatter - Frontmatter object to be updated
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 */
function processFrontmatterSidebar(frontmatter, filePaths) {
  const { destinationPath } = filePaths;
  const destFileName = path.basename(destinationPath, path.extname(destinationPath));

  frontmatter.sidebar =
    destFileName === 'readme' || destFileName === 'index'
      ? { order: 0 }
      : { order: destFileName === 'getting-started' ? 1 : 2 };
}

/**
 * Adds SEO and Open Graph meta information to frontmatter from CSV metadata
 * @param {Object} frontmatter - Frontmatter object to be updated
 * @param {Array<Object>} metaData - Array of metadata objects from CSV containing page-specific meta information
 * @param {Object} filePaths - Object containing source, relative, and destination paths
 */
function processFrontmatterMetaInfo(frontmatter, metaData, filePaths) {
  const { relativePath } = filePaths;

  const filePathObj = path.parse(normalizePathToKebabCase(relativePath));
  const calcPagePath = `/${filePathObj.dir.replaceAll('\\', '/')}/${filePathObj.name}/`.replaceAll(
    '//',
    '/'
  );

  // replace root page path
  const pagePath = calcPagePath === '/readme/' ? '/' : calcPagePath;

  const metaContent = metaData.find(metaContent => metaContent.pagePath === pagePath) || {};

  frontmatter.description = metaContent.metaDescription || `Documentation for ${relativePath}`;

  // add metainfo if present
  if (metaContent.pagePath) {
    frontmatter.head = frontmatter.head || [];

    const { metaTitle, ogTitle, ogDescription } = metaContent;

    if (metaTitle) {
      frontmatter.head.push({
        tag: 'title',
        content: metaTitle,
      });
    }

    if (ogTitle) {
      frontmatter.head.push({
        tag: 'meta',
        attrs: {
          property: 'og:title',
          content: ogTitle,
        },
      });
    }

    if (ogDescription) {
      frontmatter.head.push({
        tag: 'meta',
        attrs: {
          property: 'og:description',
          content: ogDescription,
        },
      });
    }
  }
}

/**
 * Reads and parses CSV file containing metadata for pages (meta titles, descriptions, OG tags)
 * @returns {Array<Object>} - Array of metadata objects with pagePath, metaTitle, metaDescription, ogTitle, ogDescription
 */
function prepareMetadataContent() {
  const csvContent = fs.readFileSync(path.join(APP_LOCATION, '/data/meta-content.csv'), 'utf-8');

  const { data } = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transform: value => value.trim(),
  });

  return data;
}

// Execute the sync process
syncDocs().catch(error => {
  console.error('❌ An error occurred during sync:', error);

  process.exit(1);
});
