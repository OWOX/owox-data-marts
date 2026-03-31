import { Logger } from '@nestjs/common';
import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';

const logger = new Logger('ConnectorMessageUtils');

export function truncateMessage(
  message: ConnectorMessage,
  maxLength: number = 5000
): ConnectorMessage {
  const formatted = message.toFormattedString();
  if (formatted.length <= maxLength) {
    return message;
  }

  const truncated = formatted.substring(0, maxLength);
  const truncationNote = `... [TRUNCATED: original length ${formatted.length} characters]`;

  if (message.type === ConnectorMessageType.ERROR && 'error' in message) {
    return {
      ...message,
      error: `${String(message.error).substring(0, maxLength - truncationNote.length)}${truncationNote}`,
      toFormattedString: () => `${truncated}${truncationNote}`,
    };
  }

  if (message.type === ConnectorMessageType.LOG && 'message' in message) {
    return {
      ...message,
      message: `${String(message.message).substring(0, maxLength - truncationNote.length)}${truncationNote}`,
      toFormattedString: () => `${truncated}${truncationNote}`,
    };
  }

  if (message.type === ConnectorMessageType.WARNING && 'warning' in message) {
    return {
      ...message,
      warning: `${String(message.warning).substring(0, maxLength - truncationNote.length)}${truncationNote}`,
      toFormattedString: () => `${truncated}${truncationNote}`,
    };
  }

  return {
    ...message,
    toFormattedString: () => `${truncated}${truncationNote}`,
  };
}

export function addMessageToArray(
  array: ConnectorMessage[],
  message: ConnectorMessage,
  maxCount?: number
): void {
  if (maxCount && array.length >= maxCount) {
    if (array.length === maxCount) {
      logger.warn(`Maximum number of messages (${maxCount}) reached.`);
      array.push({
        type: ConnectorMessageType.ERROR,
        at: new Date().toISOString(),
        error: `Maximum number of messages (${maxCount}) reached.`,
        toFormattedString: () => `[WARNING] Maximum number of messages (${maxCount}) reached.`,
      });
    }
    return;
  }

  array.push(truncateMessage(message));
}
