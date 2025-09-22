import { z } from 'zod';
import { MessageLogSchema } from './types/message-log.schema';
import { MessageStatusSchema } from './types/message-status.schema';
import { MessageStateSchema } from './types/message-state.schema';
import { MessageRequestedDateSchema } from './types/message-requested-date.schema';
import { MessageWarningSchema } from './types/message-warning.schema';
import { MessageUnknownSchema } from './types/message-unknown.schema';
import { MessageUpdateParameterSchema } from './types/message-update-parameter.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';
import { MessageErrorSchema } from './types/message-error.schema';
import { MessageIsInProgressSchema } from './types/message-is-in-progress.schema';

export const ConnectorMessageSchema = z
  .discriminatedUnion('type', [
    MessageLogSchema,
    MessageStatusSchema,
    MessageStateSchema,
    MessageRequestedDateSchema,
    MessageUpdateParameterSchema,
    MessageWarningSchema,
    MessageUnknownSchema,
    MessageErrorSchema,
    MessageIsInProgressSchema,
  ])
  .transform(data => {
    const createToString = () => {
      switch (data.type) {
        case ConnectorMessageType.LOG:
          return `[LOG] ${data.message}`;

        case ConnectorMessageType.STATUS:
          return `[STATUS] ${data.status}`;

        case ConnectorMessageType.STATE: {
          return `[STATE] ${data.date}`;
        }

        case ConnectorMessageType.REQUESTED_DATE: {
          const requestedDate = new Date(data.date).toLocaleString();
          return `[REQUESTED_DATE] ${requestedDate}`;
        }

        case ConnectorMessageType.UPDATE_PARAMETER: {
          return `[UPDATE_PARAMETER] ${data.parameter} -> ${typeof data.value === 'string' ? data.value : JSON.stringify(data.value)}`;
        }

        case ConnectorMessageType.WARNING:
          return `[WARNING] ${data.warning}`;

        case ConnectorMessageType.ERROR:
          return `[ERROR] ${data.error}`;

        case ConnectorMessageType.IS_IN_PROGRESS:
          return `[IS_IN_PROGRESS] ${data.status}`;

        default:
        case ConnectorMessageType.UNKNOWN:
          return `[UNKNOWN] ${JSON.stringify(data)}`;
      }
    };

    return {
      ...data,
      toFormattedString: createToString,
    };
  });

export type ConnectorMessage = z.infer<typeof ConnectorMessageSchema>;
