import { ScheduledTrigger } from './scheduled-trigger.entity';
import { TriggerStatus } from './time-based-trigger.entity';

// Create a concrete implementation of the abstract ScheduledTrigger class for testing
class TestScheduledTrigger extends ScheduledTrigger {
  constructor(cronExpression: string) {
    super();
    this.cronExpression = cronExpression;
    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.id = 'test-id';
    this.nextRunTimestamp = null;
    this.lastRunTimestamp = null;
    this.isActive = false;
    this.version = 1;
    this.status = TriggerStatus.PROCESSING;
  }
}

describe('ScheduledTrigger', () => {
  let trigger: ScheduledTrigger;

  beforeEach(() => {
    // Create a new instance of the test trigger before each test with a daily cron expression
    trigger = new TestScheduledTrigger('0 0 0 * * *');
  });

  describe('onSuccess', () => {
    it('should update lastRunTimestamp and schedule next run', () => {
      // Arrange
      const lastRunTimestamp = new Date('2023-01-02T00:00:00');

      // Act
      trigger.onSuccess(lastRunTimestamp);

      // Assert
      expect(trigger.lastRunTimestamp).toBe(lastRunTimestamp);
      expect(trigger.nextRunTimestamp).not.toBeNull();
      expect(trigger.isActive).toBe(true);
      expect(trigger.status).toBe(TriggerStatus.IDLE);
    });
  });

  describe('onError', () => {
    it('should update lastRunTimestamp and schedule next run', () => {
      // Arrange
      const lastRunTimestamp = new Date('2023-01-01T12:00:00');

      // Act
      trigger.onError(lastRunTimestamp);

      // Assert
      expect(trigger.lastRunTimestamp).toBe(lastRunTimestamp);
      expect(trigger.nextRunTimestamp).not.toBeNull();
      expect(trigger.isActive).toBe(true);
      expect(trigger.status).toBe(TriggerStatus.IDLE);
    });
  });

  describe('scheduleNextRun', () => {
    it('should handle hourly cron expression correctly', () => {
      // Arrange - Every hour
      const hourlyTrigger = new TestScheduledTrigger('0 0 * * * *');
      const startFrom = new Date('2023-01-01T12:30:00');

      // Act
      hourlyTrigger.scheduleNextRun(startFrom);

      // Assert - Should be scheduled for 13:00
      const expectedNextRun = new Date('2023-01-01T13:00:00');
      expect(hourlyTrigger.nextRunTimestamp?.toISOString()).toBe(expectedNextRun.toISOString());
    });

    it('should handle minutely cron expression correctly', () => {
      // Arrange - Every minute
      const minutelyTrigger = new TestScheduledTrigger('0 * * * * *');
      const startFrom = new Date('2023-01-01T12:30:45');

      // Act
      minutelyTrigger.scheduleNextRun(startFrom);

      // Assert - Should be scheduled for 12:31:00
      const expectedNextRun = new Date('2023-01-01T12:31:00');
      expect(minutelyTrigger.nextRunTimestamp?.toISOString()).toBe(expectedNextRun.toISOString());
    });

    it('should handle weekly cron expression correctly', () => {
      // Arrange - Every week (Sunday at midnight)
      const weeklyTrigger = new TestScheduledTrigger('0 0 0 * * 0');
      const startFrom = new Date('2023-01-03T15:30:00'); // Tuesday

      // Act
      weeklyTrigger.scheduleNextRun(startFrom);

      // Assert - Should be scheduled for next Sunday (2023-01-08T00:00:00)
      const expectedNextRun = new Date('2023-01-08T00:00:00');
      expect(weeklyTrigger.nextRunTimestamp?.toISOString()).toBe(expectedNextRun.toISOString());
    });

    it('should handle monthly cron expression correctly', () => {
      // Arrange - Every month (1st day at midnight)
      const monthlyTrigger = new TestScheduledTrigger('0 0 0 1 * *');
      const startFrom = new Date('2023-01-15T10:20:30');

      // Act
      monthlyTrigger.scheduleNextRun(startFrom);

      // Assert - Should be scheduled for next month (2023-02-01T00:00:00)
      const expectedNextRun = new Date('2023-02-01T00:00:00');
      expect(monthlyTrigger.nextRunTimestamp?.toISOString()).toBe(expectedNextRun.toISOString());
    });
  });
});
