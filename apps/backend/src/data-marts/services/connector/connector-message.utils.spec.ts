import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { truncateMessage, addMessageToArray } from './connector-message.utils';

describe('ConnectorMessageUtils', () => {
  describe('truncateMessage', () => {
    const MAX_LENGTH = 5000;

    it('returns message as-is when under limit', () => {
      const message: ConnectorMessage = {
        type: ConnectorMessageType.ERROR,
        at: new Date().toISOString(),
        error: 'short error',
        toFormattedString: () => '[ERROR] short error',
      };

      const result = truncateMessage(message, MAX_LENGTH);
      expect(result.toFormattedString()).toBe('[ERROR] short error');
    });

    it('truncates ERROR message when over limit', () => {
      const longError = 'x'.repeat(6000);
      const message: ConnectorMessage = {
        type: ConnectorMessageType.ERROR,
        at: new Date().toISOString(),
        error: longError,
        toFormattedString: () => `[ERROR] ${longError}`,
      };

      const result = truncateMessage(message, MAX_LENGTH);
      expect(result.toFormattedString().length).toBeLessThanOrEqual(MAX_LENGTH + 100);
      expect(result.toFormattedString()).toContain('[TRUNCATED');
    });

    it('truncates LOG message when over limit', () => {
      const longMsg = 'x'.repeat(6000);
      const message: ConnectorMessage = {
        type: ConnectorMessageType.LOG,
        at: new Date().toISOString(),
        message: longMsg,
        toFormattedString: () => `[LOG] ${longMsg}`,
      };

      const result = truncateMessage(message, MAX_LENGTH);
      expect(result.toFormattedString()).toContain('[TRUNCATED');
    });

    it('truncates WARNING message when over limit', () => {
      const longWarning = 'x'.repeat(6000);
      const message: ConnectorMessage = {
        type: ConnectorMessageType.WARNING,
        at: new Date().toISOString(),
        warning: longWarning,
        toFormattedString: () => `[WARNING] ${longWarning}`,
      };

      const result = truncateMessage(message, MAX_LENGTH);
      expect(result.toFormattedString()).toContain('[TRUNCATED');
    });
  });

  describe('addMessageToArray', () => {
    it('adds message to array', () => {
      const array: ConnectorMessage[] = [];
      const message: ConnectorMessage = {
        type: ConnectorMessageType.LOG,
        at: new Date().toISOString(),
        message: 'test',
        toFormattedString: () => '[LOG] test',
      };

      addMessageToArray(array, message);
      expect(array).toHaveLength(1);
      expect(array[0].toFormattedString()).toBe('[LOG] test');
    });

    it('stops adding when maxCount is reached', () => {
      const array: ConnectorMessage[] = [];
      const message: ConnectorMessage = {
        type: ConnectorMessageType.LOG,
        at: new Date().toISOString(),
        message: 'test',
        toFormattedString: () => '[LOG] test',
      };

      addMessageToArray(array, message, 1);
      addMessageToArray(array, message, 1);
      addMessageToArray(array, message, 1);

      expect(array.length).toBeLessThanOrEqual(2);
    });

    it('truncates long messages before adding', () => {
      const array: ConnectorMessage[] = [];
      const longMsg = 'x'.repeat(6000);
      const message: ConnectorMessage = {
        type: ConnectorMessageType.ERROR,
        at: new Date().toISOString(),
        error: longMsg,
        toFormattedString: () => `[ERROR] ${longMsg}`,
      };

      addMessageToArray(array, message);
      expect(array[0].toFormattedString()).toContain('[TRUNCATED');
    });
  });
});
