import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ConnectorBuilder {
  constructor() {
    this.rootDir = __dirname;
    this.srcDir = path.join(this.rootDir, 'src');
    this.distDir = path.join(this.rootDir, 'dist');
    this.tempDir = path.join(this.distDir, 'temp');
  }

  // Discover all connectors
  async discoverConnectors() {
    const connectorDirs = await glob('src/Sources/*/', {
      cwd: this.rootDir,
      ignore: ['**/Templates/**'],
    });

    const connectors = [];

    for (const dir of connectorDirs) {
      const name = path.basename(dir);
      const connectorPath = path.join(this.rootDir, dir);
      const connectorFile = path.join(connectorPath, 'Connector.js');

      if (!(await fs.pathExists(connectorFile))) {
        continue;
      }

      // Get all JS files for this connector
      const files = await glob('**/*.js', {
        cwd: connectorPath,
        ignore: ['**/*.gs', '**/node_modules/**'],
      });

      connectors.push({
        name,
        path: dir,
        files: files.map(f => path.join(dir, f)),
      });
    }

    return connectors;
  }

  // Discover all storages
  async discoverStorages() {
    const storageDirs = await glob('src/Storages/*/', { cwd: this.rootDir });
    const storages = [];

    for (const dir of storageDirs) {
      const name = path.basename(dir);
      const storagePath = path.join(this.rootDir, dir);

      const files = await glob('**/*.js', {
        cwd: storagePath,
        ignore: ['**/*.gs', '**/node_modules/**'],
      });

      if (files.length === 0) continue;

      storages.push({
        name,
        path: dir,
        files: files.map(f => path.join(dir, f)),
        manifest: (await fs.pathExists(path.join(storagePath, 'manifest.json')))
          ? JSON.parse(await fs.readFile(path.join(storagePath, 'manifest.json'), 'utf8'))
          : null,
      });
    }

    return storages;
  }

  // Extract class names from JavaScript content
  extractClassNames(content) {
    const classNames = [];

    // Remove comments
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // Find class declarations
    const classMatches = cleanContent.matchAll(/(?:^|\s)class\s+([A-Z][a-zA-Z0-9_]*)/gm);
    for (const match of classMatches) {
      classNames.push(match[1]);
    }

    if (classNames.length === 0) {
      // if not found, try to find var-style class declarations
      const varClassMatches = cleanContent.matchAll(
        /(?:^|\s)var\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*class/gm
      );
      for (const match of varClassMatches) {
        classNames.push(match[1]);
      }
    }
    return classNames;
  }

  // Build the main index.js entry file
  async buildIndexEntry() {
    await fs.ensureDir(this.tempDir);

    const connectors = await this.discoverConnectors();
    const storages = await this.discoverStorages();

    console.log(`🔍 Found ${connectors.length} connectors and ${storages.length} storages`);

    let indexContent = '// Auto-generated connector bundle\n\n';

    // 1. Build Core module
    indexContent += await this.buildCoreModule();

    // 2. Build Storage modules
    indexContent += await this.buildStorageModules(storages);

    // 3. Build Connector modules
    indexContent += await this.buildConnectorModules(connectors);

    // 4. Build exports and metadata
    indexContent += this.buildExports(connectors, storages);

    // Write the entry file
    const entryPath = path.join(this.tempDir, 'index.js');
    await fs.writeFile(entryPath, indexContent);

    // Generate manifest
    await this.generateManifest(connectors, storages);

    console.log('✅ Built entry file and manifest');
    return entryPath;
  }

  // Build Core module with all core and constants files
  async buildCoreModule() {
    let content = '// === CORE MODULE ===\n';

    // Get all core files
    const coreFiles = await glob('src/Core/*.js', { cwd: this.rootDir });
    const constantFiles = await glob('src/Constants/*.js', { cwd: this.rootDir });
    const configFiles = await glob('src/Configs/**/*.js', { cwd: this.rootDir });

    const allCoreClasses = [];
    const allConstants = [];

    // Process each file
    for (const file of [...coreFiles, ...constantFiles, ...configFiles]) {
      const filePath = path.join(this.rootDir, file);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const classNames = this.extractClassNames(fileContent);

      allCoreClasses.push(...classNames);

      // For constants files, also extract constants
      if (file.includes('Constants/')) {
        const constantNames = this.extractConstantNames(fileContent);
        allConstants.push(...constantNames);
      }

      // Add file content
      content += `\n// From ${file}\n`;
      content += fileContent + '\n';
    }

    // Create Core module export
    content += '\n// Core module export\n';
    content += 'const Core = {\n';
    for (const className of allCoreClasses) {
      content += `  ${className},\n`;
    }
    for (const constantName of allConstants) {
      content += `  ${constantName},\n`;
    }
    content += '};\n\n';

    return content;
  }

  // Build all storage modules
  async buildStorageModules(storages) {
    let content = '// === STORAGE MODULES ===\n';

    const allStorages = {};
    const coreClassNames = await this.getCoreClassNames();

    for (const storage of storages) {
      content += `\n// === ${storage.name} Storage ===\n`;
      content += `const ${storage.name} = (function() {\n`;
      content += `  // Isolated scope for ${storage.name}\n`;
      content += `  // Access to Core classes through closure\n`;
      content += `  const { ${Object.keys(coreClassNames).join(', ')} } = Core;\n\n`;

      const storageClasses = [];

      // Process each file in this storage
      for (const file of storage.files) {
        const filePath = path.join(this.rootDir, file);

        if (await fs.pathExists(filePath)) {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const processedContent = await this.processEntityFile(fileContent, storage.name);
          const classNames = this.extractClassNames(fileContent);

          storageClasses.push(...classNames);

          content += `\n  // From ${file}\n`;
          // Indent the content to be inside the IIFE
          const indentedContent = processedContent.replace(/^/gm, '  ');
          content += indentedContent + '\n';
        }
      }

      if (storage.manifest) {
        content += `\n  // Storage manifest\n`;
        content += `  const manifest = ${JSON.stringify(storage.manifest, null, 2)};\n`;
      }

      // Return the public API
      content += `\n  // Export public API\n`;
      content += `  return {\n`;
      for (const className of storageClasses) {
        content += `    ${className},\n`;
      }
      if (storage.manifest) {
        content += `    manifest,\n`;
      }
      content += `  };\n`;
      content += `})();\n`;

      allStorages[storage.name] = storageClasses;
    }

    // Create Storages collection
    content += '\n// All storages collection\n';
    content += 'const Storages = {\n';
    for (const storage of storages) {
      content += `  ${storage.name},\n`;
    }
    content += '};\n\n';

    return content;
  }

  // Build all connector modules
  async buildConnectorModules(connectors) {
    let content = '// === CONNECTOR MODULES ===\n';

    const allConnectors = {};
    const coreClassNames = await this.getCoreClassNames();

    for (const connector of connectors) {
      content += `\n// === ${connector.name} Connector ===\n`;
      content += `const ${connector.name} = (function() {\n`;
      content += `  const { ${Object.keys(coreClassNames).join(', ')} } = Core;\n\n`;

      const connectorClasses = [];

      // Process each file in this connector
      for (const file of connector.files) {
        const filePath = path.join(this.rootDir, file);

        if (await fs.pathExists(filePath)) {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const processedContent = await this.processEntityFile(fileContent, connector.name);
          const classNames = this.extractClassNames(fileContent);

          connectorClasses.push(...classNames);

          content += `\n  // From ${file}\n`;
          // Indent the content to be inside the IIFE
          const indentedContent = processedContent.replace(/^/gm, '  ');
          content += indentedContent + '\n';
        }
      }

      content += `  return {\n`;
      for (const className of connectorClasses) {
        content += `    ${className},\n`;
      }
      content += `  };\n`;
      content += `})();\n`;

      allConnectors[connector.name] = connectorClasses;
    }

    content += 'const Connectors = {\n';
    for (const connector of connectors) {
      content += `  ${connector.name},\n`;
    }
    content += '};\n\n';

    return content;
  }

  /**
   * Process entity file to handle imports and dependencies
   * @param {string} content - The content of the entity file
   * @param {string} connectorName - The name of the connector
   * @returns {string} The processed content
   */
  async processEntityFile(content, connectorName) {
    // Remove any existing imports/exports since we're bundling
    let processedContent = content
      .replace(/^import\s+.*$/gm, '') // Remove import statements
      .replace(/^export\s+.*$/gm, '') // Remove export statements
      .replace(/module\.exports\s*=.*$/gm, ''); // Remove CommonJS exports

    return processedContent;
  }

  /**
   * Get core class names for dependency injection by dynamically scanning core files
   * @returns {Object} The core class names mapped to themselves
   */
  async getCoreClassNames() {
    const coreClasses = {};

    // Get all core files
    const coreFiles = await glob('src/Core/*.js', { cwd: this.rootDir });
    const constantFiles = await glob('src/Constants/*.js', { cwd: this.rootDir });

    // Process each core file to extract class names
    for (const file of [...coreFiles, ...constantFiles]) {
      const filePath = path.join(this.rootDir, file);

      if (await fs.pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const classNames = this.extractClassNames(fileContent);

        // Add each class name to the collection
        for (const className of classNames) {
          coreClasses[className] = className;
        }

        // For constants files, also extract object/variable names
        if (file.includes('Constants/')) {
          const constantNames = this.extractConstantNames(fileContent);
          for (const constantName of constantNames) {
            coreClasses[constantName] = constantName;
          }
        }
      }
    }

    return coreClasses;
  }

  /**
   * Extract constant/variable names from JavaScript content
   * @param {string} content - The file content
   * @returns {Array} Array of constant names
   */
  extractConstantNames(content) {
    const constantNames = [];

    // Remove comments
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // Find var/const/let declarations
    const varMatches = cleanContent.matchAll(/(?:^|\s)(?:var|const|let)\s+([A-Z_][A-Z0-9_]*)/gm);
    for (const match of varMatches) {
      constantNames.push(match[1]);
    }

    return constantNames;
  }

  // Build exports section
  buildExports(connectors, storages) {
    let content = '// === EXPORTS ===\n\n';

    // Available lists
    content += 'const AvailableConnectors = [\n';
    for (const connector of connectors) {
      content += `  '${connector.name}',\n`;
    }
    content += '];\n\n';

    content += 'const AvailableStorages = [\n';
    for (const storage of storages) {
      content += `  '${storage.name}',\n`;
    }
    content += '];\n\n';

    // Main export object
    content += 'const OWOX = {\n';
    content += '  Core,\n';
    content += '  Connectors,\n';
    content += '  Storages,\n';
    content += '  AvailableConnectors,\n';
    content += '  AvailableStorages,\n\n';

    // Individual connector exports
    content += '  // Individual connectors\n';
    for (const connector of connectors) {
      content += `  ${connector.name},\n`;
    }

    content += '\n  // Individual storages\n';
    for (const storage of storages) {
      content += `  ${storage.name},\n`;
    }

    content += '};\n\n';

    // ES6 and CommonJS exports
    content += '// Export for both ES6 and CommonJS\n';
    content += 'if (typeof module !== "undefined" && module.exports) {\n';
    content += '  module.exports = OWOX;\n';
    content += '  module.exports.Core = Core;\n';
    content += '  module.exports.Connectors = Connectors;\n';
    content += '  module.exports.Storages = Storages;\n';
    content += '  module.exports.AvailableConnectors = AvailableConnectors;\n';
    content += '  module.exports.AvailableStorages = AvailableStorages;\n';
    content += '}\n';
    content += 'if (typeof window !== "undefined") {\n';
    content += '  window.OWOX = OWOX;\n';
    content += '  window.Core = Core;\n';
    content += '  window.Connectors = Connectors;\n';
    content += '  window.Storages = Storages;\n';
    content += '  window.AvailableConnectors = AvailableConnectors;\n';
    content += '  window.AvailableStorages = AvailableStorages;\n';
    content += '}\n';

    return content;
  }

  // Generate manifest.json
  async generateManifest(connectors, storages) {
    const manifest = {
      version: '1.0.0',
      buildDate: new Date().toISOString(),
      connectors: connectors.map(c => ({
        name: c.name,
        files: c.files,
        hasHelper: c.hasHelper,
        hasConnector: c.hasConnector,
        apiReferenceFiles: c.apiReferenceFiles,
        constantFiles: c.constantFiles,
      })),
      storages: storages.map(s => ({
        name: s.name,
        files: s.files,
        hasConfig: s.hasConfig,
        hasStorage: s.hasStorage,
      })),
      totals: {
        connectors: connectors.length,
        storages: storages.length,
        totalFiles:
          connectors.reduce((sum, c) => sum + c.files.length, 0) +
          storages.reduce((sum, s) => sum + s.files.length, 0),
      },
    };

    await fs.writeJSON(path.join(this.distDir, 'manifest.json'), manifest, { spaces: 2 });
    console.log('✅ Generated manifest.json');
  }
}

// Export Vite configuration
export default defineConfig({
  build: {
    lib: {
      entry: 'dist/temp/index.js',
      name: 'ConnectorBundle',
      fileName: 'index',
      formats: ['cjs', 'es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    {
      name: 'connector-builder',
      enforce: 'pre',
      async buildStart() {
        const builder = new ConnectorBuilder();
        await builder.buildIndexEntry();
      },
    },
  ],
});
