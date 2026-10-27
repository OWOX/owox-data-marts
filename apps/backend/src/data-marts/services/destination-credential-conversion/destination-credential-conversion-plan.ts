// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import type {
  AcceptedCredentialRequirement,
  CredentialPublicMetadata,
  CredentialSecret,
} from '../../credentials/credential.types';
import {
  GOOGLE_CHAT_WEBHOOK_DEFINITION_ID,
  GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
} from '../../credentials/services/builtin-credential-definitions';
import { credentialConsumerState } from '../../credentials/services/credential-consumer-state';
import { materialKey } from '../../credentials/services/credential-material-key';
import { parseGoogleServiceAccountKey } from '../../credentials/services/google-service-account-key';
import { destinationCredentialRequirement } from '../../data-destination-types/destination-credential-state';
import { isGoogleChatWebhookUrl } from '../../data-destination-types/google-chat-webhook-url';
import type { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import type { CredentialIdentity } from '../../entities/credential-identity.type';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import {
  fromGoogleOAuthRow,
  groupConversionItems,
  mergeConversionGroup,
  parsedJson,
  type MergedConversionCredential,
} from '../storage-credential-conversion/grouping';

/** A live Destination on a live old key row with no destination binding row, as the migration reads it. */
export interface UnconvertedDestination {
  readonly id: string;
  readonly projectId: string;
  readonly title: string | null;
  readonly type: DataDestinationType;
  readonly createdAt: Date;
  readonly ownerIds: readonly string[];
  readonly contextIds: readonly string[];
  /** The old key row's columns as the driver returns them: JSON may still be text. */
  readonly key: {
    readonly type: string;
    readonly credentials: unknown;
    readonly identity: unknown;
  };
}

export interface DestinationConversionOptions {
  /** The destination OAuth client and the Sheets scopes; null while Google sign-in is not configured. */
  readonly googleSignIn: {
    readonly clientId: string;
    readonly sheetsScopes: readonly string[];
  } | null;
}

export interface PlannedDestinationCredential extends MergedConversionCredential {
  readonly bindings: readonly {
    readonly destinationId: string;
    readonly requirement: AcceptedCredentialRequirement;
  }[];
}

export interface DestinationConversionPlan {
  readonly credentials: readonly PlannedDestinationCredential[];
  /** A skipped Destination keeps running on its old key. */
  readonly skipped: readonly { readonly destinationId: string; readonly reason: string }[];
  /** Converted Destinations whose Google grant lacks a required scope: they stop until a reconnect. */
  readonly lackingScopes: readonly string[];
}

type Converted = {
  readonly definitionId: string;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
};

interface ConversionItem extends Converted {
  readonly destination: UnconvertedDestination;
  readonly projectId: string;
  readonly ownerIds: readonly string[];
  readonly materialKey: string;
  readonly requirement: AcceptedCredentialRequirement;
}

const DEFINITION_ID_BY_KEY_TYPE: ReadonlyMap<string, string> = new Map([
  [DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, 'google-service-account'],
  [DestinationCredentialType.GOOGLE_OAUTH, GOOGLE_SHEETS_OAUTH_DEFINITION_ID],
  [DestinationCredentialType.GOOGLE_CHAT_WEBHOOK, GOOGLE_CHAT_WEBHOOK_DEFINITION_ID],
]);

/** The Credentials and bindings that replace the old key rows; it reads and writes nothing. */
export function planDestinationCredentialConversion(
  destinations: readonly UnconvertedDestination[],
  options: DestinationConversionOptions
): DestinationConversionPlan {
  const items: ConversionItem[] = [];
  const skipped: { destinationId: string; reason: string }[] = [];
  for (const destination of destinations) {
    const item = toItem(destination, options);
    if (typeof item === 'string') skipped.push({ destinationId: destination.id, reason: item });
    else items.push(item);
  }
  const lackingScopes = items
    .filter(
      item =>
        item.definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID &&
        credentialConsumerState(
          { enabled: true, validationState: 'unknown', publicMetadata: item.publicMetadata },
          { auth: { type: 'oauth' } },
          item.requirement.scopes
        ) === 'reauthorize-required'
    )
    .map(item => item.destination.id);
  return {
    credentials: groupConversionItems(items).map(toPlannedCredential),
    skipped,
    lackingScopes,
  };
}

/** The item, or why the Destination keeps its old key; a reason never quotes a key value. */
function toItem(
  destination: UnconvertedDestination,
  { googleSignIn }: DestinationConversionOptions
): ConversionItem | string {
  const definitionId = DEFINITION_ID_BY_KEY_TYPE.get(destination.key.type);
  // The migration selects only these key types; this guards the planner's own input.
  if (!definitionId) return 'unknown key type';
  let requirement: AcceptedCredentialRequirement;
  try {
    requirement = destinationCredentialRequirement(destination.type, {
      isClientConfigured: () => googleSignIn !== null,
      getScopes: () => [...(googleSignIn?.sheetsScopes ?? [])],
    });
  } catch {
    return 'unknown Destination type';
  }
  if (!requirement.definitionIds.includes(definitionId)) {
    return 'key type does not fit the Destination type';
  }
  if (definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID && !googleSignIn) {
    return 'Google sign-in is not configured';
  }
  let converted: Converted | string;
  try {
    const credentials = parsedJson(destination.key.credentials);
    converted =
      definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID
        ? fromGoogleOAuthRow(
            definitionId,
            credentials,
            parsedJson(destination.key.identity) as CredentialIdentity | null,
            googleSignIn!.clientId
          )
        : definitionId === GOOGLE_CHAT_WEBHOOK_DEFINITION_ID
          ? fromWebhookRow(credentials)
          : fromServiceAccountRow(credentials);
  } catch {
    return 'unparseable credentials';
  }
  if (typeof converted === 'string') return converted;
  return {
    ...converted,
    destination,
    projectId: destination.projectId,
    ownerIds: [...new Set(destination.ownerIds)].sort(),
    materialKey: materialKey(converted.definitionId, converted.secret, converted.publicMetadata),
    requirement,
  };
}

/** The key as stored; metadata as a Google Service Account Credential created from it holds. */
function fromServiceAccountRow(credentials: unknown): Converted | string {
  const key = parsedJson((credentials as { serviceAccountKey?: unknown }).serviceAccountKey);
  if (key == null) return 'no service account key';
  const value = JSON.stringify(key);
  return {
    definitionId: 'google-service-account',
    secret: { value },
    publicMetadata: parseGoogleServiceAccountKey(value).metadata,
  };
}

/** As a Google Chat webhook Credential created with the URL stores it. */
function fromWebhookRow(credentials: unknown): Converted | string {
  const { webhookUrl } = credentials as { webhookUrl?: unknown };
  // The writers trim the URL before sending, so the trimmed value is the one that works.
  const url = typeof webhookUrl === 'string' ? webhookUrl.trim() : '';
  if (!isGoogleChatWebhookUrl(url)) return 'not a Google Chat webhook URL';
  return {
    definitionId: GOOGLE_CHAT_WEBHOOK_DEFINITION_ID,
    secret: { fields: { webhookUrl: url } },
    publicMetadata: { fields: {} },
  };
}

function toPlannedCredential(group: readonly ConversionItem[]): PlannedDestinationCredential {
  return {
    ...mergeConversionGroup(group, item => item.destination),
    bindings: group.map(item => ({
      destinationId: item.destination.id,
      requirement: item.requirement,
    })),
  };
}
