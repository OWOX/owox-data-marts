import { Injectable } from '@nestjs/common';

import { ConnectorOutputCapture } from '../../interfaces/connector-output-capture.interface';
import { ConnectorMessageParserService } from './connector-message-parser.service';
import { ConnectorMessage } from '../schemas/connector-message.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';

@Injectable()
export class ConnectorOutputCaptureService {
  constructor(private readonly connectorMessageParserService: ConnectorMessageParserService) {}

  createCapture(
    onMessage: (message: ConnectorMessage) => void,
    onSpawn: (pid: number) => void
  ): ConnectorOutputCapture {
    return {
      logCapture: {
        onStdout: (message: string) => this.captureMessage(message).forEach(onMessage),
        onStderr: (message: string) => this.captureError(message).forEach(onMessage),
        passThrough: false,
      },
      onSpawn,
    };
  }

  private captureMessage(message: string): ConnectorMessage[] {
    return this.cleanMessage(message)
      .map(line => this.connectorMessageParserService.parse(line))
      .filter((parsed): parsed is ConnectorMessage => parsed !== null);
  }

  private captureError(message: string): ConnectorMessage[] {
    return this.cleanMessage(message)
      .map(line => this.connectorMessageParserService.parse(line))
      .filter((parsed): parsed is ConnectorMessage => parsed !== null)
      .map(parsedMessage =>
        // A structured JSON envelope on stderr (e.g. a classified error/warning from the
        // connector runner's crash handler) carries its own real type — only unparsed raw
        // text (stack traces, leftover console.error calls) gets wrapped as a plain ERROR.
        parsedMessage.type !== ConnectorMessageType.UNKNOWN
          ? parsedMessage
          : {
              type: ConnectorMessageType.ERROR,
              at: parsedMessage.at,
              error: parsedMessage.toFormattedString(),
              toFormattedString: () => `[ERROR] ${parsedMessage.toFormattedString()}`,
            }
      );
  }

  /**
   * The spawner (`ConnectorProcessSpawnerService.createLineBuffer`) already
   * frames stdout/stderr into individual `\n`-delimited lines before either
   * `onStdout`/`onStderr` here is called, so `message` is one line — but a
   * connector can write several envelopes back to back within it. Splitting is
   * therefore brace-aware (`splitJsonObjects`): a heuristic byte-split on literal
   * `}{` would corrupt a single valid line whose JSON string VALUE happens to
   * contain that substring (e.g. a log message describing `}{` in some data).
   */
  private cleanMessage(message: string): string[] {
    const trimmed = message.trim();
    if (trimmed === '') {
      return [];
    }
    // A connector can write several envelopes back to back with no separator, so they
    // still have to be split apart. Splitting on '}{' would also cut inside string
    // values — a stack trace or a provider error message can legitimately contain that
    // sequence — which produced two unparseable fragments instead of one entry.
    return this.splitJsonObjects(trimmed) ?? [trimmed];
  }

  /**
   * Splits a chunk into top-level JSON objects, ignoring braces inside string values.
   *
   * Returns null when the chunk is not purely a run of JSON objects — raw text such as
   * a stack trace or a stray console write — so the caller can pass it through intact
   * rather than silently dropping the parts that sit outside an object.
   */
  private splitJsonObjects(chunk: string): string[] | null {
    const objects: string[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = 0;

    for (let index = 0; index < chunk.length; index++) {
      const char = chunk[index];

      if (depth === 0) {
        if (char === '{') {
          start = index;
          depth = 1;
        } else if (char.trim() !== '') {
          return null;
        }
        continue;
      }

      if (escaped) {
        escaped = false;
      } else if (inString && char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = !inString;
      } else if (!inString && char === '{') {
        depth++;
      } else if (!inString && char === '}') {
        depth--;
        if (depth === 0) {
          objects.push(chunk.slice(start, index + 1));
        }
      }
    }

    // An unterminated object or string means the chunk was cut mid-write
    return depth === 0 && !inString && objects.length > 0 ? objects : null;
  }
}
