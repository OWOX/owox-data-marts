import { z } from 'zod';

export const UserProjectionSchema = z.object({
  userId: z.string(),
  fullName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
});

export type UserProjection = z.infer<typeof UserProjectionSchema>;
