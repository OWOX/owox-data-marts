import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  CredentialPublicMetadata,
  CredentialSecret,
} from '../../src/data-marts/credentials/credential.types';
import { CredentialConsumerBinding } from '../../src/data-marts/credentials/entities/credential-consumer-binding.entity';
import { requirementRevision } from '../../src/data-marts/credentials/services/credential-requirement-revision';
import { CredentialService } from '../../src/data-marts/credentials/services/credential.service';
import type { DataStorageType } from '../../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import {
  STORAGE_BINDING,
  storageCredentialRequirement,
} from '../../src/data-marts/data-storage-types/storage-credential-state';
import { GoogleOAuthConfigService } from '../../src/data-marts/services/google-oauth/google-oauth-config.service';

/** A Not shared built-in Credential that no member created, like a converted Storage key. */
export async function createCredential(
  app: INestApplication,
  input: {
    projectId: string;
    definitionId: string;
    title: string;
    secret: CredentialSecret;
    publicMetadata: CredentialPublicMetadata | null;
    ownerIds: string[];
    contextIds: string[];
  }
): Promise<string> {
  const { ownerIds, contextIds, ...fields } = input;
  const credential = await app.get(CredentialService).createWithAccess(
    {
      ...fields,
      definitionSource: 'builtin',
      availableForUse: false,
      availableForMaintenance: false,
    },
    { createdBy: null, ownerIds, contextIds }
  );
  return credential.id;
}

/** Binds the Storage without the member checks or the access check a bind through the API runs. */
export async function bindStorageCredential(
  app: INestApplication,
  input: { projectId: string; storageId: string; type: DataStorageType; credentialId: string }
): Promise<void> {
  const requirement = storageCredentialRequirement(input.type, app.get(GoogleOAuthConfigService));
  await app
    .get(DataSource)
    .getRepository(CredentialConsumerBinding)
    .insert({
      ...STORAGE_BINDING,
      consumerId: input.storageId,
      projectId: input.projectId,
      credentialId: input.credentialId,
      requirementSnapshot: requirement,
      requirementRevision: requirementRevision(requirement),
      configuredById: null,
      active: true,
    });
}
