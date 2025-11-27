import { Injectable } from '@nestjs/common';
import Handlebars, { HelperOptions } from 'handlebars';
import { TemplateRenderFacade } from './template-render.facade';
import { TagHandler } from '../handlers/tag-handler.interface';
import {
  COLLECTOR_SYMBOL,
  ADDITIONAL_PARAMS_SYMBOL,
  TemplateTagsMeta,
  TagCollector,
  TagMetaEntry,
  TagRenderedResult,
  RootWithAdditional,
  TemplateRenderInput,
  TemplateRenderOutput,
} from '../types/render-template.types';
import { runWithConcurrency } from '@owox/internal-helpers';

const TAG_TOKEN_PREFIX = '__TAG_TOKEN_';
const TAG_TOKEN_SUFFIX = '__';

const TagTokenUtil = {
  create(idx: number): string {
    return `${TAG_TOKEN_PREFIX}${idx}${TAG_TOKEN_SUFFIX}`;
  },

  regex: new RegExp(`${TAG_TOKEN_PREFIX}(\\d+)${TAG_TOKEN_SUFFIX}`, 'g'),
};

/**
 * Implementation of the TemplateRenderFacade using Handlebars for template rendering.
 */
@Injectable()
export class TemplateRenderFacadeImpl<
  TTagMeta extends TagMetaEntry = TagMetaEntry,
  TAdditional = unknown,
> implements TemplateRenderFacade<TTagMeta, TAdditional> {
  async render(
    input: TemplateRenderInput<TAdditional>,
    handlers: ReadonlyArray<
      TagHandler<TTagMeta['payload'], TagRenderedResult<TTagMeta['resultMeta']>>
    >
  ): Promise<TemplateRenderOutput<TemplateTagsMeta<TTagMeta>>> {
    const handlebars = Handlebars.create();

    this.registerHelpers(handlebars, handlers);

    const template = handlebars.compile(input.template);

    const root: RootWithAdditional<TAdditional> = {
      ...(input.context ?? {}),
    };

    if (input.additionalParams !== undefined) {
      root[ADDITIONAL_PARAMS_SYMBOL] = input.additionalParams;
    }

    const withTokens: string = template(root);

    const tagCollector = root[COLLECTOR_SYMBOL] as TagCollector<TTagMeta> | undefined;

    if (!tagCollector || tagCollector.calls.length === 0) {
      return { rendered: withTokens, meta: { tags: [] } };
    }

    const results = await runWithConcurrency(tagCollector.calls, 3, async ({ handler, payload }) =>
      handler.handle(payload)
    );

    const rendered = withTokens.replace(TagTokenUtil.regex, (_whole, sIdx: string) => {
      const idx = Number(sIdx);
      const res = results[idx];
      return res?.rendered ?? _whole;
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
      rendered: rendered,
      meta: { tags },
    };
  }

  private registerHelpers<T extends TagMetaEntry>(
    handlebars: typeof Handlebars,
    handlers: ReadonlyArray<TagHandler<T['payload'], TagRenderedResult<T['resultMeta']>>>
  ): void {
    for (const handler of handlers) {
      handlebars.registerHelper(handler.tag, function (...rawArgs: unknown[]) {
        const options = rawArgs.pop() as HelperOptions;
        const args = rawArgs;
        const context = this as unknown;

        const payload = handler.buildPayload(args, options, context) as T['payload'];

        const root = (options.data?.root ?? {}) as RootWithAdditional & {
          [COLLECTOR_SYMBOL]?: TagCollector<T>;
        };

        const collector = root[COLLECTOR_SYMBOL] ?? ({ calls: [] } as TagCollector<T>);

        root[COLLECTOR_SYMBOL] = collector;

        const idx =
          collector.calls.push({
            handler: handler as TagHandler<T['payload'], TagRenderedResult<T['resultMeta']>>,
            payload,
          }) - 1;

        return TagTokenUtil.create(idx);
      });
    }
  }
}
