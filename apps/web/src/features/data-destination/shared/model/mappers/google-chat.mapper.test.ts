import { describe, expect, it } from 'vitest';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationResponseDto } from '../../services/types';
import { GoogleChatMapper } from './google-chat.mapper';

describe('GoogleChatMapper', () => {
  const mapper = new GoogleChatMapper();
  const base = {
    id: 'destination-1',
    title: 'Marketing Chat',
    type: DataDestinationType.GOOGLE_CHAT,
    projectId: 'project-1',
    createdAt: new Date('2026-07-17T12:00:00Z'),
    modifiedAt: new Date('2026-07-17T12:00:00Z'),
  };

  it('reads a Destination with a webhook Credential as webhook delivery', () => {
    const destination = mapper.mapFromDto({
      ...base,
      reusableCredential: { access: 'restricted', state: 'ready' },
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({ deliveryMethod: 'webhook' });
  });

  it('reads the webhook marker a response carries as webhook delivery and never sends it back', () => {
    const destination = mapper.mapFromDto({
      ...base,
      credentials: {
        type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS,
        configured: true,
      },
      reusableCredential: { access: 'restricted', state: 'ready' },
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({ deliveryMethod: 'webhook' });
    expect(
      mapper.mapToUpdateRequest({
        title: destination.title,
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: destination.credentials,
      })
    ).toEqual({ title: 'Marketing Chat' });
  });

  it('sends the webhook Credential when creating a destination', () => {
    expect(
      mapper.mapToCreateRequest({
        title: 'Marketing Chat',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook' },
        reusableCredentialId: 'hook-1',
      })
    ).toEqual({
      title: 'Marketing Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      reusableCredentialId: 'hook-1',
    });
  });

  it('rejects a webhook create request without a Credential', () => {
    expect(() =>
      mapper.mapToCreateRequest({
        title: 'Marketing Chat',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook' },
      })
    ).toThrow('Select a Credential');
  });

  it('preserves an existing email-based Google Chat destination', () => {
    const destination = mapper.mapFromDto({
      ...base,
      credentials: {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: ['space@example.com'],
      },
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({
      deliveryMethod: 'email',
      to: ['space@example.com'],
    });
  });

  it('creates an email-based Google Chat destination when that method is selected', () => {
    expect(
      mapper.mapToCreateRequest({
        title: 'Legacy delivery',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'email', to: ['space@example.com'] },
        reusableCredentialId: 'hook-1',
      })
    ).toEqual({
      title: 'Legacy delivery',
      type: DataDestinationType.GOOGLE_CHAT,
      credentials: {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: ['space@example.com'],
      },
    });
  });

  it('keeps the current Credential when the update does not name one', () => {
    expect(
      mapper.mapToUpdateRequest({
        title: 'Renamed Chat',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook' },
      })
    ).toEqual({ title: 'Renamed Chat' });
  });

  it('switches to webhook delivery with a Credential and never sends a webhook URL', () => {
    expect(
      mapper.mapToUpdateRequest({
        title: 'Chat',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook' },
        reusableCredentialId: 'hook-2',
      })
    ).toEqual({ title: 'Chat', reusableCredentialId: 'hook-2' });
  });

  it('defaults an existing empty email configuration to webhook delivery', () => {
    const destination = mapper.mapFromDto({
      ...base,
      credentials: { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS, to: [] },
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({ deliveryMethod: 'webhook' });
  });
});
