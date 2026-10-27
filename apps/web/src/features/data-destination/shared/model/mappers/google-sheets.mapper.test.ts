import { describe, expect, it } from 'vitest';
import { DataDestinationType } from '../../enums';
import type { DataDestinationResponseDto } from '../../services/types';
import type { DataDestinationFormData } from '../../types';
import {
  mapDataDestinationFromDto,
  mapToUpdateDataDestinationRequest,
} from './data-destination.mapper';
import { GoogleSheetsMapper } from './google-sheets.mapper';

describe('GoogleSheetsMapper', () => {
  const mapper = new GoogleSheetsMapper();
  const sheets = { title: 'Sheets', type: DataDestinationType.GOOGLE_SHEETS } as const;

  it('creates a Destination with its Credential and folder', () => {
    expect(
      mapper.mapToCreateRequest({
        ...sheets,
        reusableCredentialId: 'sa-1',
        config: { folderUrl: ' https://drive.google.com/drive/folders/abc ' },
      })
    ).toEqual({
      ...sheets,
      reusableCredentialId: 'sa-1',
      config: { folderUrl: 'https://drive.google.com/drive/folders/abc' },
    });
  });

  it('refuses to create a Destination without a Credential', () => {
    expect(() => mapper.mapToCreateRequest(sheets)).toThrow('Select a Credential');
  });

  it('sends the Credential on update only when the form names one', () => {
    expect(mapper.mapToUpdateRequest({ ...sheets, reusableCredentialId: 'sa-2' })).toEqual({
      title: 'Sheets',
      reusableCredentialId: 'sa-2',
    });
    expect(mapper.mapToUpdateRequest(sheets)).toEqual({ title: 'Sheets' });
  });

  it('clears the folder when its URL is emptied', () => {
    expect(mapper.mapToUpdateRequest({ ...sheets, config: { folderUrl: '  ' } })).toEqual({
      title: 'Sheets',
      config: { folderUrl: null },
    });
  });

  it('ignores the public key details a response carries for the Sheets add-in', () => {
    const destination = mapDataDestinationFromDto({
      id: 'destination-1',
      title: 'Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      projectId: 'project-1',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      modifiedAt: new Date('2026-10-01T00:00:00Z'),
      credentials: {
        type: 'google-sheets-credentials',
        serviceAccountKey: {
          type: 'service_account',
          project_id: 'project',
          client_email: 'sa@project.iam.gserviceaccount.com',
        },
      },
      reusableCredential: { access: 'restricted', state: 'ready' },
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({});
    const request = mapToUpdateDataDestinationRequest({
      ...destination,
      reusableCredentialId: '',
    } as DataDestinationFormData);
    expect(request).toEqual({ title: 'Sheets' });
    expect(request).not.toHaveProperty('credentials');
  });
});
