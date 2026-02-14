import { HelperOptions } from 'handlebars';

/**
 * Interface for handling custom tags in markdown templates.
 */
export interface TagHandler<TInput = unknown, TResult = unknown> {
  readonly tag: string;

  /**
   * If true, the handler is executed inline during Handlebars compilation
   * and its rendered result is inserted directly (not deferred via token).
   * Use for synchronous handlers that don't need tracking in meta/tags.
   */
  readonly immediate?: boolean;

  buildPayload(args: unknown[], options: HelperOptions, context: unknown): TInput;

  handle(input: TInput): Promise<TResult> | TResult;
}
