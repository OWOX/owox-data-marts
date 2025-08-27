import { z } from 'zod';
import { JWK } from 'jose';

export const JsonWebKeySchema = z
  .object({
    kty: z.string(),
    use: z.string(),
    alg: z.string(),
    kid: z.string(),
    n: z.string(),
    e: z.string(),
  })
  .passthrough();

export const JwksResponseSchema = z
  .object({
    keys: z.array(JsonWebKeySchema).nonempty(),
  })
  .transform(v => ({ keys: v.keys as unknown as JWK[] }));

export type JwksResponse = z.infer<typeof JwksResponseSchema>;
