// @ts-check
import fs from 'node:fs';
import path from 'path';

// File scanning constants
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage',
  'out',
]);
const CHANGELOG_FILENAME = 'CHANGELOG.md';

// Regex patterns
const PATTERNS = {
  SEMVER: /^[0-9]+\.[0-9]+\.[0-9]+$/,
  H2: /^##([^#].*)$/,
  H3: /^###\s*(.+)$/,
  VERSION_SUFFIX: /\s+[0-9]+\.[0-9]+\.[0-9]+$/,
  QUOTE: /^\s*>/,
};

// Target headings to process
const TARGET_HEADINGS = ['minor changes', 'patch changes'];

/**
 * Main execution function that orchestrates the entire process
 */
function main() {
  console.log('🚀 Starting CHANGELOG.md headings fix process...');

  const startTime = Date.now();
  const root = process.cwd();

  const changelogs = findChangelogs(root);

  if (changelogs.length === 0) {
    console.log('🔍 No CHANGELOG.md files found.');
    return;
  }

  console.log(`📁 Found ${changelogs.length} CHANGELOG.md file(s)`);

  const { processedCount, modifiedCount } = processChangelogs(changelogs);

  const duration = Date.now() - startTime;
  console.log(`\n🎉 Process completed in ${duration}ms`);
  console.log(`📊 Processed: ${processedCount} files`);
  console.log(`✏️ Modified: ${modifiedCount} files`);
}

/**
 * Recursively finds all CHANGELOG.md files in the project
 * Note: Mutates the result array for performance in recursive calls
 * @param {string} dir - Directory to search in
 * @param {string[]} result - Array to store found changelog paths (mutated)
 * @returns {string[]} Array of paths to CHANGELOG.md files
 */
function findChangelogs(dir, result = []) {
  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (!EXCLUDED_DIRS.has(file)) {
            findChangelogs(fullPath, result);
          }
        } else if (file === CHANGELOG_FILENAME) {
          result.push(fullPath);
        }
      } catch (error) {
        console.warn(`⚠️ Warning: Could not access ${fullPath}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${dir}: ${error.message}`);
  }

  return result;
}

/**
 * Processes all found changelog files and returns statistics
 * @param {string[]} changelogs - Array of changelog file paths
 * @returns {{processedCount: number, modifiedCount: number}} Processing statistics
 */
function processChangelogs(changelogs) {
  let processedCount = 0;
  let modifiedCount = 0;

  for (const changelog of changelogs) {
    processedCount++;
    if (fixHeadings(changelog)) {
      modifiedCount++;
    }
  }

  return { processedCount, modifiedCount };
}

/**
 * Checks if a line is a markdown quote
 * @param {string} line - Line to check
 * @returns {boolean} True if the line is a quote
 */
function isQuote(line) {
  return PATTERNS.QUOTE.test(line);
}

/**
 * Main logic for processing a single CHANGELOG.md file
 * @param {string} filePath - Path to the CHANGELOG.md file
 * @returns {boolean} True if the file was modified, false otherwise
 */
function fixHeadings(filePath) {
  try {
    console.log(`🔍 Processing file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: File does not exist: ${filePath}`);
      return false;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    let currentVersion = null;
    let changed = false;
    let changesCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip quotes
      if (isQuote(line)) {
        continue;
      }

      // h2: Check all h2 headings
      const h2Match = line.match(PATTERNS.H2);
      if (h2Match) {
        const h2Content = h2Match[1].trim();
        const versionMatch = h2Content.match(PATTERNS.SEMVER);

        currentVersion = versionMatch ? h2Content : null;

        continue;
      }

      // h3: Check all h3 headings
      const h3Match = line.match(PATTERNS.H3);
      if (h3Match && currentVersion !== null) {
        const h3Content = h3Match[1].trim().toLowerCase();

        // Check if heading already ends with a version pattern
        const endsWithVersion = PATTERNS.VERSION_SUFFIX.test(h3Content);
        if (endsWithVersion) {
          continue;
        }

        // Check if heading is "Minor Changes" or "Patch Changes"
        if (TARGET_HEADINGS.includes(h3Content)) {
          const newLine = `${line} ${currentVersion}`;
          lines[i] = newLine;
          changesCount++;
          changed = true;
          console.log(`🔧 Fixed heading: "${line}" -> "${newLine}"`);
        }
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      console.log(`✅ Fixed ${changesCount} heading(s) in: ${filePath}`);
      return true;
    } else {
      console.log(`✅ No changes needed in: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing file ${filePath}: ${error.message}`);
    return false;
  }
}

// Execute the main function
main();
