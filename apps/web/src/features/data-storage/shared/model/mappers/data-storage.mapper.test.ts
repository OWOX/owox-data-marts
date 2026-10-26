import { describe, expect, it } from 'vitest';
import type { DataStorageResponseDto } from '../../api/types';
import { DataStorageType, RedshiftConnectionType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema';
import { mapDataStorageFromDto, mapToUpdateDataStorageRequest } from './data-storage.mapper';

const formData = {
  title: 'Warehouse',
  type: DataStorageType.SNOWFLAKE,
  config: { account: 'acc', warehouse: 'wh' },
  reusableCredentialId: 'cred-1',
} as DataStorageFormData;

const dto = {
  id: 'storage-1',
  title: 'Warehouse',
  type: DataStorageType.SNOWFLAKE,
  config: { account: 'acc', warehouse: 'wh' },
  createdAt: '2026-06-09T10:00:00.000Z',
  modifiedAt: '2026-06-09T10:00:00.000Z',
  publishedDataMartsCount: 0,
  draftDataMartsCount: 0,
} satisfies DataStorageResponseDto;

describe('mapToUpdateDataStorageRequest', () => {
  it('sends the selected Credential and no keys', () => {
    expect(mapToUpdateDataStorageRequest(formData)).toEqual({
      title: 'Warehouse',
      config: { account: 'acc', warehouse: 'wh' },
      reusableCredentialId: 'cred-1',
    });
  });

  // Synapse has no mapper, so it is never sent.
  const configs = {
    [DataStorageType.GOOGLE_BIGQUERY]: { projectId: 'p', location: 'US' },
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: { projectId: 'p', location: 'US' },
    [DataStorageType.AWS_ATHENA]: { region: 'r', outputBucket: 'b' },
    [DataStorageType.SNOWFLAKE]: { account: 'acc', warehouse: 'wh' },
    [DataStorageType.DATABRICKS]: { host: 'h', httpPath: '/p' },
    [DataStorageType.AWS_REDSHIFT]: {
      connectionType: RedshiftConnectionType.SERVERLESS,
      region: 'r',
      database: 'd',
      workgroupName: 'w',
    },
  } satisfies Record<Exclude<DataStorageType, DataStorageType.AZURE_SYNAPSE>, object>;

  it.each(Object.entries(configs))(
    'sends only the title, config and Credential for %s',
    (type, config) => {
      const request = mapToUpdateDataStorageRequest({
        ...formData,
        type,
        config,
        // Keys the form may still hold from before Credentials; none may reach the request.
        credentials: { private_key: 'secret' },
        credentialId: 'old',
        sourceStorageId: 'other',
      } as unknown as DataStorageFormData);

      expect(Object.keys(request).sort()).toEqual(['config', 'reusableCredentialId', 'title']);
    }
  );

  it('leaves the binding alone when no Credential is sent', () => {
    const { reusableCredentialId: _unchanged, ...rest } = formData;
    void _unchanged;

    expect(mapToUpdateDataStorageRequest(rest as DataStorageFormData)).not.toHaveProperty(
      'reusableCredentialId'
    );
  });
});

describe('mapDataStorageFromDto', () => {
  it('keeps the Credential summary of a Storage', () => {
    const summary = { access: 'restricted', state: 'disabled' } as const;

    expect(mapDataStorageFromDto({ ...dto, reusableCredential: summary }).reusableCredential).toBe(
      summary
    );
    expect(mapDataStorageFromDto({ ...dto, reusableCredential: null })).toHaveProperty(
      'reusableCredential',
      null
    );
  });

  it('adds no summary to a Storage embedded in a Data Mart', () => {
    expect(mapDataStorageFromDto(dto)).not.toHaveProperty('reusableCredential');
  });
});
