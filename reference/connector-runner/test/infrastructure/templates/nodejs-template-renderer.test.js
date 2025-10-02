const NodeJsTemplateRenderer = require('../../../src/infrastructure/templates/nodejs-template-renderer');

describe('NodeJsTemplateRenderer', () => {
  let templateRenderer;

  beforeEach(() => {
    templateRenderer = new NodeJsTemplateRenderer();
  });

  test('should render template with dependencies correctly', () => {
    const deps = [
      { name: 'test-package', global: ['testGlobal'], global_is: true },
      { name: 'test-package-2', global: ['testGlobal2', 'testGlobal3'], global_is: true },
    ];

    const template = templateRenderer.render(deps);

    expect(template).toContain("const  testGlobal  = require('test-package');");
    expect(template).toContain('global.testGlobal = testGlobal;');
    expect(template).toContain("const  testGlobal2,testGlobal3  = require('test-package-2');");
    expect(template).toContain('global.testGlobal2 = testGlobal2;');
    expect(template).toContain('global.testGlobal3 = testGlobal3;');
  });

  test('should handle empty dependencies', () => {
    const template = templateRenderer.render([]);

    expect(template).not.toContain("require('test-package')");
    expect(template).toContain('const { Core, Connectors, Storages } = OWOX;');
  });

  test('should handle dependencies with global_is true', () => {
    const deps = [{ name: 'test-package', global: ['testGlobal'], global_is: true }];
    const template = templateRenderer.render(deps);

    expect(template).toContain("const  testGlobal  = require('test-package');");
    expect(template).toContain('global.testGlobal = testGlobal;');
  });

  test('should handle dependencies with global_is false', () => {
    const deps = [
      { name: 'test-package', global: ['testGlobal1', 'testGlobal2'], global_is: false },
    ];
    const template = templateRenderer.render(deps);

    expect(template).toContain("const { testGlobal1,testGlobal2 } = require('test-package');");
    expect(template).toContain('global.testGlobal1 = testGlobal1;');
    expect(template).toContain('global.testGlobal2 = testGlobal2;');
  });

  test('should include OW_RUN_CONFIG environment variable handling', () => {
    const template = templateRenderer.render([]);

    expect(template).toContain('const runConfigJson = process.env.OW_RUN_CONFIG;');
    expect(template).toContain(
      'const runConfig = runConfigJson ? new Core.AbstractRunConfig(JSON.parse(runConfigJson)) : new Core.AbstractRunConfig();'
    );
  });

  test('should include all required environment variables', () => {
    const template = templateRenderer.render([]);

    expect(template).toContain('const envConfig = JSON.parse(process.env.OW_CONFIG);');
    expect(template).toContain('const datamartId = process.env.OW_DATAMART_ID;');
    expect(template).toContain('const runId = process.env.OW_RUN_ID;');
    expect(template).toContain('const runConfigJson = process.env.OW_RUN_CONFIG;');
  });

  test('should include proper error handling for missing source class', () => {
    const template = templateRenderer.render([]);

    expect(template).toContain('const sourceClass = global[sourceName];');
    expect(template).toContain('if (!sourceClass) {');
    expect(template).toContain('throw new Error(`Source class ${sourceName} not found`);');
  });

  test('should include proper error handling for missing storage class', () => {
    const template = templateRenderer.render([]);

    expect(template).toContain('const storageClass = global[storageName];');
    expect(template).toContain('if (!storageClass) {');
    expect(template).toContain('throw new Error(`Storage class ${storageName} not found`);');
  });

  test('should include connector instantiation with runConfig parameter', () => {
    const template = templateRenderer.render([]);

    expect(template).toContain("const connector = new sourceClass[sourceName + 'Connector'](");
    expect(template).toContain('config,');
    expect(template).toContain('source,');
    expect(template).toContain("storageName + 'Storage',");
    expect(template).toContain('runConfig');
  });
});
