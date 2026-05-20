import { RoleEnum } from '@owox/idp-protocol';
import { z } from 'zod';

/**
 * Java MembershipRequestDto (only the fields BI needs). The list endpoint
 * returns pending requests only, so a `status` field on the wire is ignored —
 * we don't surface it through the IDP protocol type.
 *
 * `requestedRole` is pinned to `RoleEnum` so role drift on the Java side
 * fails fast at the BI boundary (clean 502 from upstream parse) instead of
 * leaking a malformed string through casts at every downstream hop.
 */
export const OwoxMembershipRequestSchema = z.object({
  requestId: z.string().min(1),
  email: z.string().min(1),
  requestedRole: RoleEnum,
  createdAt: z.string().min(1),
  userId: z.string().min(1).optional(),
  fullName: z.string().optional(),
  avatar: z.string().nullish(),
});

export const OwoxListMembershipRequestsResponseSchema = z.array(OwoxMembershipRequestSchema);

export type OwoxListMembershipRequestsResponse = z.infer<
  typeof OwoxListMembershipRequestsResponseSchema
>;

export const OwoxApproveMembershipRequestResponseSchema = z.object({
  userUid: z.string().min(1),
});

export type OwoxApproveMembershipRequestResponse = z.infer<
  typeof OwoxApproveMembershipRequestResponseSchema
>;
