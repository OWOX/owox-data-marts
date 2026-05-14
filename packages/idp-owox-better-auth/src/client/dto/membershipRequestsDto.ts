import { z } from 'zod';

/**
 * Java MembershipRequestDto (only the fields BI needs). The list endpoint
 * returns pending requests only, so a `status` field on the wire is ignored —
 * we don't surface it through the IDP protocol type.
 */
export const OwoxMembershipRequestSchema = z.object({
  requestId: z.string(),
  email: z.string(),
  requestedRole: z.string(),
  createdAt: z.string(),
  userId: z.string().optional(),
  fullName: z.string().optional(),
  avatar: z.string().optional(),
});

export const OwoxMembershipRequestsResponseSchema = z.array(OwoxMembershipRequestSchema);

export type OwoxMembershipRequestsResponse = z.infer<typeof OwoxMembershipRequestsResponseSchema>;

export const OwoxApproveMembershipRequestResponseSchema = z.object({
  userUid: z.string(),
});

export type OwoxApproveMembershipRequestResponse = z.infer<
  typeof OwoxApproveMembershipRequestResponseSchema
>;
