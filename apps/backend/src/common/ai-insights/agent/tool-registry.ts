import { AiContext, ToolDefinition, ToolRunResult, ToolSchema } from './types';
import { castError } from '@owox/internal-helpers';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool already registered: ${def.name}`);
    }
    this.tools.set(def.name, def);
  }

  getOpenAiTools(): ToolSchema[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputJsonSchema,
    }));
  }

  async executeToToolMessage<TFinal = never>(
    name: string,
    argsJson: string,
    context: AiContext
  ): Promise<ToolRunResult<TFinal>> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    let parsed: unknown;
    try {
      parsed = argsJson ? JSON.parse(argsJson) : {};
    } catch (e) {
      throw new Error(`Invalid JSON arguments for ${name}: ${castError(e).stack}`);
    }

    const validated = tool.inputZod.parse(parsed);
    const result = await tool.execute(validated, context);

    return { isFinal: tool.isFinal, content: result } as ToolRunResult<TFinal>;
  }

  findFinalTool(): ToolDefinition | undefined {
    for (const tool of this.tools.values()) {
      if (tool.isFinal) {
        return tool;
      }
    }
    return undefined;
  }
}
