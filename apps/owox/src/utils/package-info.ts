/**
 * @file Utility module for retrieving package information.
 * Provides functionality to access package.json data in an ES module environment.
 */

import { createRequire } from 'node:module';

/**
 * Retrieves package information from package.json.
 *
 * This function uses Node.js's createRequire to import package.json
 * in an ES module environment, allowing access to package metadata
 * such as name, version, dependencies, etc.
 *
 * @returns {object} The package.json content as a JavaScript object
 * @example
 * ```typescript
 * const packageInfo = getPackageInfo();
 * console.log(packageInfo.name); // Package name
 * console.log(packageInfo.version); // Package version
 * ```
 */
export function getPackageInfo() {
  const require = createRequire(import.meta.url);
  const packageInfo = require('../../package.json');

  return packageInfo;
}
