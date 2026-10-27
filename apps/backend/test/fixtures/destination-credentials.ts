import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { serviceAccountKey } from './google-service-account-key';
import { createCredential } from './storage-credentials';

export const CHAT_WEBHOOK_URL =
  'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1';

/** A Not shared Google Service Account Credential, which fits Google Sheets Destinations. */
export function createServiceAccountCredential(
  app: INestApplication,
  input: { projectId: string; title: string; ownerIds: string[]; clientEmail: string }
): Promise<string> {
  return createCredential(app, {
    projectId: input.projectId,
    definitionId: 'google-service-account',
    title: input.title,
    secret: { value: serviceAccountKey({ client_email: input.clientEmail }) },
    publicMetadata: {
      clientEmail: input.clientEmail,
      projectId: 'acme-docs',
      privateKeyId: 'key-1',
    },
    ownerIds: input.ownerIds,
    contextIds: [],
  });
}

/** A Not shared Google Chat webhook Credential. */
export function createChatWebhookCredential(
  app: INestApplication,
  input: { projectId: string; title: string; ownerIds: string[] }
): Promise<string> {
  return createCredential(app, {
    projectId: input.projectId,
    definitionId: 'google-chat-webhook',
    title: input.title,
    secret: { fields: { webhookUrl: CHAT_WEBHOOK_URL } },
    publicMetadata: null,
    ownerIds: input.ownerIds,
    contextIds: [],
  });
}

/** The Credential a Destination is actively bound to, or null. */
export async function boundDestinationCredentialId(
  app: INestApplication,
  destinationId: string
): Promise<string | null> {
  const [row] = (await app
    .get(DataSource)
    .query(
      "SELECT credentialId FROM credential_consumer_binding WHERE consumerType = 'destination' AND consumerId = ? AND active = 1",
      [destinationId]
    )) as Array<{ credentialId: string }>;
  return row?.credentialId ?? null;
}
