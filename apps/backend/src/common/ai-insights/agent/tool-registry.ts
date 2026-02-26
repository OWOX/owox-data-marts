import { AiContext, ToolDefinition, ToolNameBase, ToolRunResult } from './types';
import { AiToolDefinition } from './ai-core';
import { castError } from '@owox/internal-helpers';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool already registered: ${def.name}`);
    }
    this.tools.set(def.name, def);
  }

  getAiTools(): AiToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputJsonSchema: t.inputJsonSchema,
    }));
  }

  async executeToToolMessage(
    name: ToolNameBase,
    argsJson: string,
    context: AiContext
  ): Promise<ToolRunResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      const available = Array.from(this.tools.keys()).join(', ');
      return {
        name,
        content: { error: `Unknown tool "${name}". Available tools: ${available}` },
      };
    }

    let parsed: unknown;
    try {
      parsed = argsJson ? JSON.parse(argsJson) : {};
    } catch (e) {
      return {
        name,
        content: { error: `Invalid JSON arguments for ${name}: ${castError(e).message}` },
      };
    }

    const validated = tool.inputZod.parse(parsed);
    const result = await tool.execute(validated, context);

    return { name: name, content: result };
  }

  findToolByNames(toolNames: ToolNameBase[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];

    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`No tool found: ${name}`);
      }
      result.push(tool);
    }

    return result;
  }
}
