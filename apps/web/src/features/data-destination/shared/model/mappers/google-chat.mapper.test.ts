import { describe, expect, it } from 'vitest';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationResponseDto } from '../../services/types';
import { GoogleChatMapper } from './google-chat.mapper';

describe('GoogleChatMapper', () => {
  const mapper = new GoogleChatMapper();

  it('maps a redacted API credential to a configured form state', () => {
    const destination = mapper.mapFromDto({
      id: 'destination-1',
      title: 'Marketing Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      projectId: 'project-1',
      credentials: {
        type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS,
        configured: true,
      },
      createdAt: new Date('2026-07-17T12:00:00Z'),
      modifiedAt: new Date('2026-07-17T12:00:00Z'),
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({ deliveryMethod: 'webhook', configured: true });
  });

  it('sends a pasted webhook when creating a destination', () => {
    const webhookUrl =
      'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1';

    expect(
      mapper.mapToCreateRequest({
        title: 'Marketing Chat',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook', webhookUrl },
      })
    ).toEqual({
      title: 'Marketing Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      credentials: {
        type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS,
        webhookUrl,
      },
    });
  });

  it('preserves an existing email-based Google Chat destination', () => {
    const destination = mapper.mapFromDto({
      id: 'destination-1',
      title: 'Legacy Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      projectId: 'project-1',
      credentials: {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: ['space@example.com'],
      },
      createdAt: new Date('2026-07-17T12:00:00Z'),
      modifiedAt: new Date('2026-07-17T12:00:00Z'),
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

  it('does not overwrite a saved webhook when the hidden field remains blank', () => {
    expect(
      mapper.mapToUpdateRequest({
        title: 'Renamed Chat',
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook', configured: true },
      })
    ).toEqual({ title: 'Renamed Chat' });
  });

  it('defaults an existing empty email configuration to webhook delivery', () => {
    const destination = mapper.mapFromDto({
      id: 'destination-1',
      title: 'Empty Legacy Chat',
      type: DataDestinationType.GOOGLE_CHAT,
      projectId: 'project-1',
      credentials: {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: [],
      },
      createdAt: new Date('2026-07-17T12:00:00Z'),
      modifiedAt: new Date('2026-07-17T12:00:00Z'),
    } satisfies DataDestinationResponseDto);

    expect(destination.credentials).toEqual({
      deliveryMethod: 'webhook',
      configured: false,
    });
  });
});
