import { Injectable } from '@nestjs/common';
import Handlebars, { HelperOptions } from 'handlebars';
import {
  MarkdownTemplateToMarkdownFacade,
  MarkdownTemplateToMarkdownInput,
  MarkdownTemplateToMarkdownOutput,
} from './markdown-template-to-markdown.facade';
import { TagHandler } from '../handlers/tag-handler.interface';
import {
  COLLECTOR_SYMBOL,
  ADDITIONAL_PARAMS_SYMBOL,
  MarkdownTagsMeta,
  TagCollector,
  TagMetaEntry,
  TagRenderedResult,
  RootWithAdditional,
} from '../types/markdown-template.types';

const REGISTERED = new WeakSet<typeof Handlebars>();

/**
 * Implementation of the MarkdownTemplateToMarkdownFacade.
 * This class uses Handlebars to process markdown templates with custom tags.
 */
@Injectable()
export class MarkdownTemplateToMarkdownFacadeImpl<
  TTagMeta extends TagMetaEntry = TagMetaEntry,
  TAdditional = unknown,
> implements MarkdownTemplateToMarkdownFacade<MarkdownTagsMeta<TTagMeta>, TAdditional>
{
  constructor(
    private readonly handlers: ReadonlyArray<
      TagHandler<TTagMeta['payload'], TagRenderedResult<TTagMeta['resultMeta']>>
    >
  ) {
    this.ensureHelpersRegistered(this.handlers);
  }

  async render(
    input: MarkdownTemplateToMarkdownInput<TAdditional>
  ): Promise<MarkdownTemplateToMarkdownOutput<MarkdownTagsMeta<TTagMeta>>> {
    const template = Handlebars.compile(input.template);

    const root: RootWithAdditional<TAdditional> = {
      ...(input.context ?? {}),
    };

    if (input.additionalParams !== undefined) {
      root[ADDITIONAL_PARAMS_SYMBOL] = input.additionalParams;
    }

    const withTokens: string = template(root);

    const tagCollector = root[COLLECTOR_SYMBOL] as TagCollector<TTagMeta> | undefined;

    if (!tagCollector || tagCollector.calls.length === 0) {
      return { markdown: withTokens, meta: { tags: [] } };
    }

    const results = await Promise.all(
      tagCollector.calls.map(({ handler, payload }) => handler.handle(payload))
    );

    const markdown = withTokens.replace(/__TAG_TOKEN_(\d+)__/g, (whole, sIdx: string) => {
      const idx = Number(sIdx);
      const res = results[idx];
      return res?.rendered ?? whole;
    });

    const tags: TTagMeta[] = tagCollector.calls.map(
      (call, idx) =>
        ({
          tag: call.handler.tag,
          payload: call.payload,
          resultMeta: results[idx]?.meta,
        }) as TTagMeta
    );

    return {
      markdown,
      meta: { tags },
    };
  }

  private ensureHelpersRegistered<T extends TagMetaEntry>(
    handlers: ReadonlyArray<TagHandler<T['payload'], TagRenderedResult<T['resultMeta']>>>
  ): void {
    if (REGISTERED.has(Handlebars)) return;

    for (const handler of handlers) {
      Handlebars.registerHelper(handler.tag, function (...rawArgs: unknown[]) {
        const options = rawArgs.pop() as HelperOptions;
        const args = rawArgs;
        const context = this as unknown;

        const payload = handler.buildPayload(args, options, context) as T['payload'];

        const root = (options.data?.root ?? {}) as RootWithAdditional & {
          [COLLECTOR_SYMBOL]?: TagCollector<T>;
        };

        const collector =
          (root[COLLECTOR_SYMBOL] as TagCollector<T> | undefined) ??
          ({ calls: [] } as TagCollector<T>);

        root[COLLECTOR_SYMBOL] = collector;

        const idx =
          collector.calls.push({
            handler: handler as TagHandler<T['payload'], TagRenderedResult<T['resultMeta']>>,
            payload,
          }) - 1;

        return `__TAG_TOKEN_${idx}__`;
      });
    }

    REGISTERED.add(Handlebars);
  }
}
