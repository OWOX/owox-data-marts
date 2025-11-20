import { HelperOptions } from 'handlebars';

/**
 * Interface for handling custom tags in markdown templates.
 */
export interface TagHandler<TInput = unknown, TResult = unknown> {
  readonly tag: string;

  buildPayload(args: unknown[], options: HelperOptions, context: unknown): TInput;

  handle(input: TInput): Promise<TResult> | TResult;
}
