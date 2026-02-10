import { z } from 'zod';

export class AiContentFilterError extends Error {
  constructor(
    readonly providerName: string,
    readonly status?: number,
    readonly body?: string
  ) {
    super(`${providerName} content filter triggered`);
    this.name = 'AiContentFilterError';
  }
}

export class AiChatHttpError extends Error {
  constructor(
    readonly providerName: string,
    readonly status: number,
    readonly statusText: string,
    readonly body: string
  ) {
    super(`${providerName} chat failed: ${status} ${statusText} ${body}`);
    this.name = 'AiChatHttpError';
  }
}

const innerErrorSchema = z
  .object({
    code: z.string().optional(),
  })
  .passthrough();

export const ErrorPayloadSchema = z
  .object({
    message: z.string().optional(),
    type: z.union([z.string(), z.null()]).optional(),
    param: z.union([z.string(), z.null()]).optional(),
    code: z.union([z.string(), z.number(), z.null()]).optional(),
    status: z.number().optional(),
    innererror: innerErrorSchema.optional(),
  })
  .passthrough();

export const ErrorEnvelopeSchema = z.object({ error: ErrorPayloadSchema }).passthrough();

export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
