import { Injectable, Logger } from '@nestjs/common';

import { ConnectorOutputCapture } from '../../interfaces/connector-output-capture.interface';
import { ConnectorMessageParserService } from './connector-message-parser.service';
import { ConnectorMessage } from '../schemas/connector-message.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';
import { ConnectorOutputState } from '../../interfaces/connector-output-state';

@Injectable()
export class ConnectorOutputCaptureService {
  private logger = new Logger(ConnectorOutputCaptureService.name);

  constructor(private readonly connectorMessageParserService: ConnectorMessageParserService) {}

  createCapture(
    dataMartId: string,
    capturedErrors: ConnectorMessage[],
    capturedLogs: ConnectorMessage[],
    state: ConnectorOutputState
  ): ConnectorOutputCapture {
    return {
      logCapture: {
        onStdout: (message: string) => {
          message
            .trim()
            .split('\n')
            .forEach(line => {
              const parsedMessage = this.connectorMessageParserService.parse(line);
              switch (parsedMessage.type) {
                case ConnectorMessageType.STATUS:
                  if (this.isErrorStatus(parsedMessage)) {
                    capturedErrors.push(parsedMessage);
                  } else {
                    capturedLogs.push(parsedMessage);
                  }
                  break;
                case ConnectorMessageType.STATE:
                  this.processState(state, parsedMessage);
                  break;
                default:
                  capturedLogs.push(parsedMessage);
                  break;
              }
              this.logger.log(`${parsedMessage.toFormattedString()}`);
            });
        },
        onStderr: (message: string) => {
          message
            .trim()
            .split('\n')
            .forEach(line => {
              const parsedMessage = this.connectorMessageParserService.parse(line);
              capturedErrors.push(parsedMessage);
              this.logger.error(`${parsedMessage.toFormattedString()}`);
            });
        },
        passThrough: false,
      },
    };
  }

  private isErrorStatus(parsedMessage: ConnectorMessage): boolean {
    if (parsedMessage.type === ConnectorMessageType.STATUS) {
      if (parsedMessage.status === 'error') {
        return true;
      }
    }
    return false;
  }

  private processState(state: ConnectorOutputState, parsedMessage: ConnectorMessage): void {
    if (parsedMessage.type === ConnectorMessageType.STATE) {
      if (state.at < parsedMessage.at) {
        state.state = { date: parsedMessage.date };
        state.at = parsedMessage.at;
      }
    }
  }
}
