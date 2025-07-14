import { Injectable } from '@nestjs/common';

import { ConnectorOutputCapture } from '../../interfaces/connector-output-capture.interface';
import { ConnectorMessageParserService } from './connector-message-parser.service';
import { ConnectorMessage } from '../schemas/connector-message.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';

@Injectable()
export class ConnectorOutputCaptureService {
  constructor(private readonly connectorMessageParserService: ConnectorMessageParserService) {}

  createCapture(onMessage: (message: ConnectorMessage) => void): ConnectorOutputCapture {
    return {
      logCapture: {
        onStdout: (message: string) => this.captureMessage(message).forEach(onMessage),
        onStderr: (message: string) => this.captureError(message).forEach(onMessage),
        passThrough: false,
      },
    };
  }

  private captureMessage(message: string): ConnectorMessage[] {
    return this.cleanMessage(message).map(line => {
      const parsedMessage = this.connectorMessageParserService.parse(line);
      return parsedMessage;
    });
  }

  private captureError(message: string): ConnectorMessage[] {
    return this.cleanMessage(message).map(line => {
      const parsedMessage = this.connectorMessageParserService.parse(line);
      return {
        type: ConnectorMessageType.ERROR,
        at: parsedMessage.at,
        error: parsedMessage.toFormattedString(),
        toFormattedString: () => `[ERROR] ${parsedMessage.toFormattedString()}`,
      };
    });
  }

  private cleanMessage(message: string): string[] {
    return message
      .trim()
      .replaceAll('}{', '}\n{')
      .replaceAll('}\n{', '}\n??\n{')
      .split('\n??\n')
      .filter(line => line.trim() !== '');
  }
}
