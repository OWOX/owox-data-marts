import { AgentFlowToolsRegistrar, AgentFlowTools } from './agent-flow-tools.registrar';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';

const makeCoreToolMock = () => ({
  execute: jest.fn(),
  description: 'mock description',
  inputSchema: {},
});

const makeRegistrar = () => {
  const listTemplateSourcesTool = makeCoreToolMock();
  const getTemplateContentTool = makeCoreToolMock();
  const proposeRemoveSourceTool = { execute: jest.fn() };
  const generateSqlTool = makeCoreToolMock();
  const listAvailableTagsTool = {
    execute: jest.fn(),
    description: 'list tags',
    inputSchema: {},
  };

  const registrar = new AgentFlowToolsRegistrar(
    listTemplateSourcesTool as never,
    getTemplateContentTool as never,
    proposeRemoveSourceTool as never,
    generateSqlTool as never,
    listAvailableTagsTool as never
  );

  return { registrar };
};

describe('AgentFlowToolsRegistrar', () => {
  it('registers all core tools', () => {
    const { registrar } = makeRegistrar();
    const registry = new ToolRegistry();

    registrar.registerTools(registry);

    const coreNames = [
      AgentFlowTools.LIST_TEMPLATE_SOURCES,
      AgentFlowTools.GET_TEMPLATE_CONTENT,
      AgentFlowTools.PROPOSE_REMOVE_SOURCE,
      AgentFlowTools.GENERATE_SQL,
      AgentFlowTools.LIST_AVAILABLE_TAGS,
    ];
    for (const name of coreNames) {
      expect(registry.has(name)).toBe(true);
    }
  });
});
