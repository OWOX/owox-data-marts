import { IdpOwoxPayloadSchema, type IdpOwoxPayload } from '../client/index.js';
import { Payload, PayloadSchema, resolveViewOnlyFromClaims } from '@owox/idp-protocol';

const IdpOwoxToPayloadSchema = IdpOwoxPayloadSchema.transform((src: IdpOwoxPayload) => {
  // Only the protocol contract field viewOnly is mapped — no readOnly/roles mixing.
  const viewOnly = resolveViewOnlyFromClaims(src as Record<string, unknown>);

  return {
    userId: src.userId,
    projectId: src.projectId,
    email: src.userEmail,
    signinProvider: src.signinProvider ?? undefined,
    fullName: src.userFullName,
    avatar: src.userAvatar ?? undefined,
    roles: src.roles,
    projectTitle: src.projectTitle,
    authFlow: src.authFlow ?? undefined,
    apiKeyId: src.apiKeyId ?? undefined,
    // Only set when true so normal sessions stay free of the flag.
    ...(viewOnly ? { viewOnly: true } : {}),
  };
}).pipe(PayloadSchema);

/**
 * Maps Identity OWOX payloads into idp-protocol payloads.
 */
export function toPayload(input: unknown): Payload {
  return IdpOwoxToPayloadSchema.parse(input);
}
