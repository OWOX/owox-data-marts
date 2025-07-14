const TemplateRenderer = require('../../core/interfaces/template-renderer');

/**
 * Node.js template renderer implementation
 * Generates execution templates for Node.js environments
 */
class NodeJsTemplateRenderer extends TemplateRenderer {
  /**
   * Render the execution template with the given dependencies
   * @param {Array} dependencies - List of dependencies to include in template
   * @returns {string} Rendered template content
   */
  render(dependencies) {
    return `
            ${this._getDependencies(dependencies)}
            ${this._getOwoxLibs()}
            ${this._getMain()}

            main().catch(console.error);
        `;
  }

  _getDependencies(dependencies) {
    return dependencies
      .map(dependency => {
        let dep = `const ${dependency.global_is ? '' : '{'} ${dependency.global} ${dependency.global_is ? '' : '}'} = require('${dependency.name}');\n`;
        for (const global of dependency.global) {
          dep += `global.${global} = ${global};\n`;
        }
        return dep;
      })
      .join('\n');
  }

  _getOwoxLibs() {
    return `
            const { Core, Connectors, Storages } = OWOX;

            Object.keys(Core).forEach(key => {
                global[key] = Core[key];
            });

            Object.keys(Storages).forEach(key => {
                const storage = Storages[key];
                global[key] = storage;
                Object.keys(storage).forEach(key => {
                    global[key] = storage[key];
                });
            });

            Object.keys(Connectors).forEach(key => {
                const connector = Connectors[key];
                global[key] = connector;
                Object.keys(connector).forEach(key => {
                    global[key] = connector[key];
                });
            });
        `;
  }

  _getMain() {
    return `
        async function main() {
            const envConfig = JSON.parse(process.env.OW_CONFIG);
            const datamartId = process.env.OW_DATAMART_ID;
            const runId = process.env.OW_RUN_ID;

            const config = new Core.NodeJsConfig(envConfig);

            const sourceName = config.getSourceName();
            const storageName = config.getStorageName();

            const sourceClass = global[sourceName];
            if (!sourceClass) {
                throw new Error(\`Source class \${sourceName} not found\`);
            }

            const storageClass = global[storageName];
            if (!storageClass) {
                throw new Error(\`Storage class \${storageName} not found\`);
            }

            const source = new sourceClass[sourceName + 'Source'](config);
            const connector = new sourceClass[sourceName + 'Connector'](
                config,
                source,
                storageName + 'Storage'
            );

            // Run the connector
            connector.run();
        }
        `;
  }
}

module.exports = NodeJsTemplateRenderer;
