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
});
