import { z } from 'zod';
import { RoleEnum } from '@owox/idp-protocol';

/** Payload schema returned by Identity OWOX introspection. */
export const IdpOwoxPayloadSchema = z
  .object({
    userId: z.string().min(1, 'userId is required'),
    projectId: z.string().min(1, 'projectId is required'),
    userEmail: z.string().email(),
    userFullName: z.string().min(1, 'userFullName is required'),
    userAvatar: z.string().url().nullable(),
    roles: z.preprocess(
      val => {
        if (typeof val === 'string') {
          return val
            .split(',')
            .map(r => r.trim().toLowerCase())
            .filter(Boolean);
        }
        if (Array.isArray(val)) {
          return val.map(r => String(r).trim().toLowerCase()).filter(Boolean);
        }
        return [];
      },
      z
        .array(RoleEnum)
        .nonempty()
        .transform(arr => Array.from(new Set(arr)))
    ),
    projectTitle: z.string().min(1, 'projectTitle is required'),
    signinProvider: z.string().optional().nullable(),
  })
  .passthrough();

export type IdpOwoxPayload = z.infer<typeof IdpOwoxPayloadSchema>;
