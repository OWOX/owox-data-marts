import { z } from 'zod';
import { IdpOwoxPayload, IdpOwoxPayloadSchema } from './idpOwoxPayloadDto.js';

export interface IntrospectionRequest {
  token: string;
}

const ActiveSchema = IdpOwoxPayloadSchema.extend({
  isActive: z.literal(true),
});

type PayloadShape = typeof IdpOwoxPayloadSchema extends z.ZodObject<infer S> ? S : never;
const inactiveShape = Object.fromEntries(
  Object.keys((IdpOwoxPayloadSchema as z.ZodObject<PayloadShape>).shape).map(k => [k, z.null()])
) as { [K in keyof IdpOwoxPayload]: z.ZodNull };

const InactiveSchema = z
  .object(inactiveShape)
  .strict()
  .extend({ isActive: z.literal(false) });

export const IntrospectionResponseSchema = z.discriminatedUnion('isActive', [
  ActiveSchema,
  InactiveSchema,
]);

export type IntrospectionResponse = z.infer<typeof IntrospectionResponseSchema>;
