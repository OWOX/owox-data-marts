import { MCP_GUIDES, MCP_GUIDE_TOPICS } from '../instructions/mcp-guides';
import { GetGuideTool } from './get-guide.tool';

describe('GetGuideTool', () => {
  const tool = new GetGuideTool();

  it('is a read-only tool that every connection with mcp:read can call', () => {
    expect(tool.name).toBe('get_guide');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool).not.toHaveProperty('requiredRole');
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('lists every topic in its description', () => {
    for (const topic of MCP_GUIDE_TOPICS) {
      expect(tool.description).toContain(topic);
    }
  });

  it.each(MCP_GUIDE_TOPICS)('returns the %s guide as text', async topic => {
    await expect(tool.handler({ topic })).resolves.toEqual({
      content: [{ type: 'text', text: MCP_GUIDES[topic] }],
    });
  });

  it('rejects a topic that has no guide', () => {
    expect(() => tool.parseInput({ topic: 'querying' })).toThrow();
    expect(() => tool.parseInput({})).toThrow();
  });
});
