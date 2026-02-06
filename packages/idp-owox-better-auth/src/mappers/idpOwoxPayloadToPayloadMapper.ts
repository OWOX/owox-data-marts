import { IdpOwoxPayloadSchema, type IdpOwoxPayload } from '../client/index.js';
import { Payload, PayloadSchema } from '@owox/idp-protocol';

const IdpOwoxToPayloadSchema = IdpOwoxPayloadSchema.transform((src: IdpOwoxPayload) => ({
  userId: src.userId,
  projectId: src.projectId,
  email: src.userEmail,
  fullName: src.userFullName,
  avatar: src.userAvatar ?? undefined,
  roles: src.roles,
  projectTitle: src.projectTitle,
})).pipe(PayloadSchema);

export function toPayload(input: unknown): Payload {
  return IdpOwoxToPayloadSchema.parse(input);
}
