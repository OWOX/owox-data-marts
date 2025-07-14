import { ConnectorMessageType } from '../enums/connector-message-type-enum';

export interface ConnectorMessage {
  type: ConnectorMessageType;
  message: string;
  at: string;
  toFormattedString: () => string;
}
