const path = require('path');
const fs = require('fs');

/**
 * Finds the root directory of a specific npm package by searching upwards from a given path.
 * The root is identified by a package.json file containing a matching package name.
 *
 * @param {string} startPath The absolute path to a file within the package to start the search from.
 * @param {string} packageName The expected name of the package in the package.json file.
 * @returns {string} The absolute path to the package's root directory, or the original startPath if no matching package is found.
 */
function findPackageRoot(startPath, packageName) {
  // Start searching from the directory containing the startPath file.
  let currentDir = path.dirname(startPath);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        const packageData = JSON.parse(content);

        // Check if the found package.json has the correct name.
        if (packageData.name === packageName) {
          return currentDir; // This is the root directory we were looking for.
        }
      } catch {
        // Ignore errors from a corrupted package.json and continue searching upwards.
      }
    }

    const parentDir = path.dirname(currentDir);

    // If we've reached the filesystem root, return the original startPath.
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

module.exports = { findPackageRoot };
