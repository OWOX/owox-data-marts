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
      serviceNotifications: z.boolean().optional().default(true),
      performanceSuggestions: z.boolean().optional().default(false),
      offers: z.boolean().optional().default(false),
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

/**
 * Response from the remote Identity OWOX API for invite. Mirrors the Java
 * `InviteProjectMemberResponseDto`: the server confirms by returning the
 * freshly provisioned (or already-existing) user uid. Email delivery and
 * business validations all happen server-side; nothing else is echoed back.
 */
export const OwoxInviteProjectMemberResponseSchema = z.object({
  userUid: z.string().min(1),
});

export type OwoxInviteProjectMemberResponse = z.infer<typeof OwoxInviteProjectMemberResponseSchema>;
