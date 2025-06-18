import { TimeBasedTrigger, TriggerStatus } from './time-based-trigger.entity';

// Create a concrete implementation of the abstract TimeBasedTrigger class for testing
class TestTimeBasedTrigger extends TimeBasedTrigger {}

describe('TimeBasedTrigger', () => {
  let trigger: TimeBasedTrigger;

  beforeEach(() => {
    // Create a new instance of the test trigger before each test
    trigger = new TestTimeBasedTrigger();
    trigger.id = 'test-id';
    trigger.nextRunTimestamp = new Date();
    trigger.lastRunTimestamp = null;
    trigger.isActive = true;
    trigger.version = 1;
    trigger.status = TriggerStatus.IDLE;
  });

  describe('onSuccess', () => {
    it('should update lastRunTimestamp, set status to SUCCESS, and discard next run', () => {
      // Arrange
      const lastRunTimestamp = new Date();

      // Act
      trigger.onSuccess(lastRunTimestamp);

      // Assert
      expect(trigger.lastRunTimestamp).toBe(lastRunTimestamp);
      expect(trigger.status).toBe(TriggerStatus.SUCCESS);
      expect(trigger.nextRunTimestamp).toBeNull();
      expect(trigger.isActive).toBe(false);
    });
  });

  describe('onError', () => {
    it('should update lastRunTimestamp and set status to ERROR', () => {
      // Arrange
      const lastRunTimestamp = new Date();
      const initialNextRunTimestamp = trigger.nextRunTimestamp;
      const initialIsActive = trigger.isActive;

      // Act
      trigger.onError(lastRunTimestamp);

      // Assert
      expect(trigger.lastRunTimestamp).toBe(lastRunTimestamp);
      expect(trigger.status).toBe(TriggerStatus.ERROR);
      expect(trigger.nextRunTimestamp).toBe(initialNextRunTimestamp);
      expect(trigger.isActive).toBe(initialIsActive);
    });
  });

  describe('discardNextRun', () => {
    it('should set nextRunTimestamp to null and isActive to false', () => {
      // Arrange
      trigger.nextRunTimestamp = new Date();
      trigger.isActive = true;

      // Act
      trigger.discardNextRun();

      // Assert
      expect(trigger.nextRunTimestamp).toBeNull();
      expect(trigger.isActive).toBe(false);
    });
  });
});
