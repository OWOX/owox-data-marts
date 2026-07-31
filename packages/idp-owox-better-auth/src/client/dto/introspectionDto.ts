import { z } from 'zod';
import { IdpOwoxPayload, IdpOwoxPayloadSchema } from './idpOwoxPayloadDto.js';

/** Token introspection request payload. */
export interface IntrospectionRequest {
  token: string;
}

const ActiveSchema = IdpOwoxPayloadSchema.extend({
  isActive: z.literal(true),
});

type PayloadShape = typeof IdpOwoxPayloadSchema extends z.ZodObject<infer S> ? S : never;
// Inactive introspection responses carry no usable identity. IB versions differ
// in which null payload fields they serialize, so keep those fields optional
// while validating any field that is present.
const inactiveShape = Object.fromEntries(
  Object.keys((IdpOwoxPayloadSchema as z.ZodObject<PayloadShape>).shape).map(k => [
    k,
    z.null().optional(),
  ])
) as { [K in keyof IdpOwoxPayload]: z.ZodOptional<z.ZodNull> };

const InactiveSchema = z
  .object(inactiveShape)
  .strict()
  .extend({
    isActive: z.literal(false),
    viewOnly: z.boolean().nullable().optional(),
  });

/** Token introspection response schema. */
export const IntrospectionResponseSchema = z.discriminatedUnion('isActive', [
  ActiveSchema,
  InactiveSchema,
]);

export type IntrospectionResponse = z.infer<typeof IntrospectionResponseSchema>;
