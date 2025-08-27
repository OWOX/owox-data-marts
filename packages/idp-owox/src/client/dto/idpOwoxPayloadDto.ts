import { z } from 'zod';
import { RoleEnum } from '@owox/idp-protocol';

export const IdpOwoxPayloadSchema = z
  .object({
    userId: z.string().min(1, 'userId is required'),
    projectId: z.string().min(1, 'projectId is required'),
    userEmail: z.string().email(),
    userFullName: z.string().min(1, 'userFullName is required'),
    userAvatar: z.string().url(),
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
  })
  .passthrough();

export type IdpOwoxPayload = z.infer<typeof IdpOwoxPayloadSchema>;
