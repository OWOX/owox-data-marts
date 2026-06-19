import { Injectable, Logger } from '@nestjs/common';
import { ConnectorMessage, ConnectorMessageSchema } from '../schemas/connector-message.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD } = Core;

@Injectable()
export class ConnectorMessageParserService {
  private logger = new Logger(ConnectorMessageParserService.name);

  parse(message: string): ConnectorMessage {
    try {
      const asJson = JSON.parse(message);
      const parsedMessage = ConnectorMessageSchema.safeParse(asJson);
      if (!parsedMessage.success) {
        this.logger.warn(`Schema validation failed for message:`, {
          message: this.redactCredentialUpdateMessage(message),
          parsedJson: this.redactCredentialUpdateJson(asJson),
          errors: parsedMessage.error.errors,
        });
        return this.parseAsUnknown(message);
      }
      return parsedMessage.data;
    } catch {
      return this.parseAsUnknown(message);
    }
  }

  private parseAsUnknown(message: string): ConnectorMessage {
    const safeMessage = this.redactCredentialUpdateMessage(message).trim();

    return {
      type: ConnectorMessageType.UNKNOWN,
      at: new Date().toISOString(),
      message: safeMessage,
      toFormattedString: () => `[UNKNOWN] ${safeMessage}`,
    };
  }

  private redactCredentialUpdateMessage(message: string): string {
    if (
      !message.includes('updateCredentials') &&
      !message.includes(GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD)
    ) {
      return message;
    }

    return '[REDACTED updateCredentials message]';
  }

  private redactCredentialUpdateJson(value: unknown): unknown {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (!this.hasCredentialUpdateContent(value)) {
      return value;
    }

    return '[REDACTED updateCredentials message]';
  }

  private hasCredentialUpdateContent(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    if (Array.isArray(value)) {
      return value.some(item => this.hasCredentialUpdateContent(item));
    }

    const objectValue = value as Record<string, unknown>;
    if (
      objectValue.type === ConnectorMessageType.CREDENTIALS_UPDATE ||
      Object.prototype.hasOwnProperty.call(objectValue, GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD)
    ) {
      return true;
    }

    return Object.values(objectValue).some(item => this.hasCredentialUpdateContent(item));
  }
}
