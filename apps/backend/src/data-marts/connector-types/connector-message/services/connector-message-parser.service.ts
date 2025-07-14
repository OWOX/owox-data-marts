import { Injectable, Logger } from '@nestjs/common';
import { ConnectorMessage, ConnectorMessageSchema } from '../schemas/connector-message.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';

@Injectable()
export class ConnectorMessageParserService {
  private logger = new Logger(ConnectorMessageParserService.name);

  parse(message: string): ConnectorMessage {
    try {
      const asJson = JSON.parse(message);
      const parsedMessage = ConnectorMessageSchema.safeParse(asJson);
      if (!parsedMessage.success) {
        this.logger.warn(`Schema validation failed for message:`, {
          message: message,
          parsedJson: asJson,
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
    return {
      type: ConnectorMessageType.UNKNOWN,
      at: new Date().toISOString(),
      message: message.trim(),
      toFormattedString: () => `[UNKNOWN] ${message.trim()}`,
    };
  }
}
