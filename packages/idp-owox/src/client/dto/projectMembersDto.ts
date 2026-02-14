import { z } from 'zod';

export const OwoxProjectMemberSchema = z.object({
  userId: z.number(),
  userStatus: z.enum(['active', 'locked', 'erased']),
  fullName: z.string(),
  email: z.string(),
  avatar: z.string().nullish(),
  projectRole: z.string(),
  subscriptions: z
    .object({
      ServiceNotifications: z.boolean().optional().default(true),
      PerformanceSuggestions: z.boolean().optional().default(false),
      Offers: z.boolean().optional().default(false),
    })
    .optional(),
});

export const OwoxProjectMembersResponseSchema = z.object({
  project: z.object({
    projectId: z.string(),
    projectTitle: z.string(),
  }),
  projectMembers: z.array(OwoxProjectMemberSchema),
});

export type OwoxProjectMembersResponse = z.infer<typeof OwoxProjectMembersResponseSchema>;
