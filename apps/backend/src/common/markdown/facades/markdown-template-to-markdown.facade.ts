export type MarkdownTemplateToMarkdownInput<TAdditional = unknown> = {
  template: string;
  context?: Record<string, unknown>;
  additionalParams?: TAdditional;
};

export type MarkdownTemplateToMarkdownOutput<TMeta = Record<string, unknown>> = {
  markdown: string;
  meta?: TMeta;
};

export interface MarkdownTemplateToMarkdownFacade<
  TMeta = Record<string, unknown>,
  TAdditional = unknown,
> {
  render(
    input: MarkdownTemplateToMarkdownInput<TAdditional>
  ): Promise<MarkdownTemplateToMarkdownOutput<TMeta>>;
}
