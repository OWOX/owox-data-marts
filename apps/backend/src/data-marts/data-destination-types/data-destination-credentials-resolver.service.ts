import { Injectable } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import type { z } from 'zod';
import { GOOGLE_CHAT_WEBHOOK_DEFINITION_ID } from '../credentials/services/builtin-credential-definitions';
import { DataDestinationCredentials } from './data-destination-credentials.type';
import { GoogleSheetsCredentialsSchema } from './google-sheets/schemas/google-sheets-credentials.schema';
import { DataDestination } from '../entities/data-destination.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import {
  CredentialsExpiredException,
  GoogleOAuthException,
} from '../exceptions/google-oauth.exceptions';
import { DestinationCredentialUnavailableException } from '../exceptions/destination-credential-unavailable.exception';
import {
  DestinationCredentialBindingService,
  type ResolvedDestinationCredential,
} from './destination-credential-binding.service';
import { toDestinationAdapterCredentials } from './destination-credential-definitions';
import type { DestinationCredentialSummary } from './destination-credential-state';
import {
  definitionIdOfRow,
  identityOf,
  publicCredentialsOfBound,
  publicCredentialsOfRow,
} from './destination-public-credentials';
import { DataDestinationType } from './enums/data-destination-type.enum';

// Old rows of the kinds a Credential replaces; Email, Looker and Chat-by-email rows stay.
const CONVERTIBLE_ROW_TYPES: ReadonlySet<string> = new Set([
  DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
  DestinationCredentialType.GOOGLE_OAUTH,
  DestinationCredentialType.GOOGLE_CHAT_WEBHOOK,
]);

// A bound service account always carries its key.
const BoundServiceAccountSchema = GoogleSheetsCredentialsSchema.required({
  serviceAccountKey: true,
});

/** How a Destination authenticates: its bound Credential, else its old row (null when it has none). */
export type DestinationAuth =
  | { readonly kind: 'unbound'; readonly credentials: DataDestinationCredentials | null }
  | {
      readonly kind: 'service-account';
      readonly credentials: z.infer<typeof BoundServiceAccountSchema>;
    }
  | {
      readonly kind: 'google-account';
      readonly client: OAuth2Client;
      readonly scopes: readonly string[];
    }
  | { readonly kind: 'webhook'; readonly credentials: DataDestinationCredentials };

@Injectable()
export class DataDestinationCredentialsResolver {
  constructor(private readonly destinationCredentials: DestinationCredentialBindingService) {}

  /** The bound Credential in the shape the writers parse, else the old row; never both. */
  async resolve(
    destination: DataDestination,
    { markUsed = true }: { markUsed?: boolean } = {}
  ): Promise<DataDestinationCredentials> {
    const auth = await this.resolveAuth(destination, { markUsed });
    if (auth.kind === 'google-account') {
      throw new Error(
        `Destination ${destination.id} uses a Google account Credential; resolve it with resolveAuth`
      );
    }
    if (!auth.credentials) throw new Error('Destination credentials are not configured');
    return auth.credentials;
  }

  /** The whole auth in one binding lookup; a bound Destination never falls back to its old row. */
  async resolveAuth(
    destination: DataDestination,
    { markUsed = true }: { markUsed?: boolean } = {}
  ): Promise<DestinationAuth> {
    const bound = await this.destinationCredentials.resolveForDestination(destination);
    if (!bound) {
      return {
        kind: 'unbound',
        credentials: (destination.credential?.credentials as DataDestinationCredentials) ?? null,
      };
    }
    assertUsable(bound);
    const auth =
      'oauth' in bound.secret
        ? await this.googleAccount(destination.projectId, bound)
        : keyAuth(bound);
    if (markUsed) {
      await this.destinationCredentials.markDestinationUsed(destination.id, bound.credentialId);
    }
    return auth;
  }

  /** The Credential's client and the scopes Google granted it. */
  private async googleAccount(
    projectId: string,
    bound: ResolvedDestinationCredential
  ): Promise<DestinationAuth> {
    let client: OAuth2Client;
    try {
      ({ client } = await this.destinationCredentials.getGoogleOAuth2Client(
        projectId,
        bound.credentialId
      ));
    } catch (error) {
      // Google refused the refresh, or the grant's client was replaced; reconnecting fixes both.
      if (
        error instanceof CredentialsExpiredException ||
        (error instanceof GoogleOAuthException && error.code === 'OAUTH_NOT_CONFIGURED')
      ) {
        throw lostGrantException();
      }
      throw error;
    }
    const metadata = bound.publicMetadata;
    return {
      kind: 'google-account',
      client,
      scopes: metadata && 'scopes' in metadata ? metadata.scopes : [],
    };
  }

  /** The bound Credential's definition, else null; reads no secret and records no use. */
  boundDefinitionId(destination: DataDestination): Promise<string | null> {
    return this.destinationCredentials.boundDefinitionIdOfDestination(destination);
  }

  /** A Credential about to be bound, in the shape the writers parse; null for a Google account. */
  candidateCredentials(
    candidate: ResolvedDestinationCredential
  ): DataDestinationCredentials | null {
    // A Google account is not checked here: the folder check only ever refused keys.
    if ('oauth' in candidate.secret) return null;
    assertUsable(candidate);
    return keyAuth(candidate).credentials;
  }

  /** Bound Destinations' Credentials as the member sees them, `pending` for one on its old row. */
  async summarize(
    projectId: string,
    userId: string,
    roles: readonly string[],
    destinations: readonly Pick<DataDestination, 'id' | 'type' | 'credential'>[]
  ): Promise<ReadonlyMap<string, DestinationCredentialSummary>> {
    const summaries = new Map<string, DestinationCredentialSummary>(
      await this.destinationCredentials.summarizeForDestinations({
        projectId,
        userId,
        roles,
        destinations: destinations.map(({ id, type }) => ({ id, type })),
      })
    );
    // The address to share a sheet with is no secret; members saw it before Destinations took Credentials.
    const bound = await this.destinationCredentials.publicOfDestinations(
      projectId,
      destinations
        .filter(({ id, type }) => summaries.has(id) && hasPublicCredentials(type))
        .map(({ id }) => id)
    );
    for (const { id, type } of destinations) {
      const summary = summaries.get(id);
      const info = bound.get(id);
      if (!summary || !info) continue;
      const credentials = publicCredentialsOfBound(info.definitionId, info.publicMetadata);
      const sheets =
        type === DataDestinationType.GOOGLE_SHEETS && summary.access === 'restricted'
          ? { definitionId: info.definitionId, identity: identityOf(info.publicMetadata) }
          : {};
      summaries.set(id, { ...summary, ...sheets, ...(credentials && { credentials }) });
    }
    const onOldRow = destinations.filter(
      ({ id, credential }) =>
        !summaries.has(id) && credential && CONVERTIBLE_ROW_TYPES.has(credential.type)
    );
    if (onOldRow.length === 0) return summaries;
    // A binding whose Credential is gone has no summary, but the Destination never runs on its old row.
    const stillBound = await this.destinationCredentials.findBoundDestinationIds(
      projectId,
      onOldRow.map(({ id }) => id)
    );
    for (const { id, type, credential } of onOldRow) {
      if (stillBound.has(id) || !credential) continue;
      const credentials = publicCredentialsOfRow(credential);
      summaries.set(id, {
        access: 'pending',
        state: 'ready',
        ...(type === DataDestinationType.GOOGLE_SHEETS && {
          identity: credential.identity?.clientEmail ?? credential.identity?.email ?? null,
          definitionId: definitionIdOfRow(credential.type),
        }),
        ...(credentials && { credentials }),
      });
    }
    return summaries;
  }
}

function hasPublicCredentials(type: DataDestinationType): boolean {
  return type === DataDestinationType.GOOGLE_SHEETS || type === DataDestinationType.GOOGLE_CHAT;
}

function keyAuth(
  bound: ResolvedDestinationCredential
): Extract<DestinationAuth, { kind: 'webhook' | 'service-account' }> {
  let credentials: DataDestinationCredentials;
  try {
    credentials = toDestinationAdapterCredentials(
      bound.definitionId,
      bound.secret,
      bound.publicMetadata
    );
  } catch {
    // The parse error can quote a fragment of the key, so it is dropped.
    throw unreadableKeyError();
  }
  if (bound.definitionId === GOOGLE_CHAT_WEBHOOK_DEFINITION_ID) {
    return { kind: 'webhook', credentials };
  }
  const parsed = BoundServiceAccountSchema.safeParse(credentials);
  if (!parsed.success) throw unreadableKeyError();
  return { kind: 'service-account', credentials: parsed.data };
}

function unreadableKeyError(): Error {
  return new Error("The stored key of this Destination's Credential could not be read");
}

/** Errors never name the Credential: callers may see only its restricted summary. */
function assertUsable({ state }: ResolvedDestinationCredential): void {
  if (state === 'disabled') {
    throw new DestinationCredentialUnavailableException(
      "This Destination's Credential is disabled. A Credential maintainer can enable it on the Credentials page.",
      false
    );
  }
  if (state === 'not-configured') {
    throw new DestinationCredentialUnavailableException(
      'Sheets Google account Credentials cannot be used because Google sign-in is not configured on this server.',
      false
    );
  }
  if (state === 'reconnect-required') throw lostGrantException();
  if (state === 'reauthorize-required') {
    throw new DestinationCredentialUnavailableException(
      "This Destination's Credential lacks the Google permissions this Destination needs. A Credential maintainer can reconnect it on the Credentials page to grant them.",
      true
    );
  }
}

function lostGrantException(): DestinationCredentialUnavailableException {
  return new DestinationCredentialUnavailableException(
    "This Destination's Credential lost Google authorization. A Credential maintainer can reconnect it on the Credentials page.",
    true
  );
}
