import { TimeBasedFetchStrategy } from './strategies/time-based-fetch.strategy';
import { TriggerFetcherService } from './trigger-fetcher.service';
import { SystemTimeService } from '../system-time.service';
import { TimeBasedTrigger } from '../../shared/entities/time-based-trigger.entity';
import { TriggerStatus } from '../../shared/entities/trigger-status';
import { FindOptionsWhere, LessThanOrEqual, Repository, UpdateResult } from 'typeorm';
import { Logger } from '@nestjs/common';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

// Create a concrete implementation of the abstract TimeBasedTrigger class for testing
class TestTimeBasedTrigger extends TimeBasedTrigger {
  constructor(id: string, nextRunTimestamp: Date | null = null) {
    super();
    this.id = id;
    this.nextRunTimestamp = nextRunTimestamp;
    this.lastRunTimestamp = null;
    this.isActive = true;
    this.version = 1;
    this.status = TriggerStatus.IDLE;
  }
}

describe('TimeBasedTriggerFetcherService', () => {
  let service: TriggerFetcherService<TestTimeBasedTrigger>;
  let repository: jest.Mocked<Repository<TestTimeBasedTrigger>>;
  let systemTimeService: jest.Mocked<SystemTimeService>;

  const mockCurrentTime = new Date('2023-01-01T12:00:00Z');
  const trigger1 = new TestTimeBasedTrigger('trigger-1', new Date('2023-01-01T11:00:00Z'));
  const trigger2 = new TestTimeBasedTrigger('trigger-2', new Date('2023-01-01T11:30:00Z'));
  const mockTriggers = [trigger1, trigger2];

  beforeEach(async () => {
    // Create mock repository
    repository = {
      metadata: { name: 'TestTimeBasedTrigger' },
      update: jest
        .fn()
        .mockImplementation(
          async (
            criteria: FindOptionsWhere<TestTimeBasedTrigger>,
            _partial: QueryDeepPartialEntity<TestTimeBasedTrigger>
          ) => {
            if (criteria) {
              if (
                (criteria as FindOptionsWhere<TestTimeBasedTrigger>).id === 'trigger-1' ||
                (criteria as FindOptionsWhere<TestTimeBasedTrigger>).id === 'trigger-2'
              ) {
                return { affected: 1 } as UpdateResult;
              }
            }
            return { affected: 0 } as UpdateResult;
          }
        ),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<TestTimeBasedTrigger>>;

    // Create mock system time service
    systemTimeService = {
      now: jest.fn().mockReturnValue(mockCurrentTime),
    } as unknown as jest.Mocked<SystemTimeService>;

    // Mock logger methods to prevent console output during tests
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    // Create service instance
    service = new TriggerFetcherService<TestTimeBasedTrigger>(
      repository,
      systemTimeService,
      0,
      new TimeBasedFetchStrategy<TestTimeBasedTrigger>()
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTriggersReadyForProcessing', () => {
    it('should fetch and mark triggers as ready for processing', async () => {
      // Arrange
      repository.find.mockResolvedValue(mockTriggers);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify the query was built correctly
      expect(systemTimeService.now).toHaveBeenCalled();
      expect(repository.find).toHaveBeenCalledTimes(1);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            status: TriggerStatus.IDLE,
            nextRunTimestamp: LessThanOrEqual(mockCurrentTime),
          }),
          order: { nextRunTimestamp: 'ASC' },
        })
      );

      // Verify the triggers were marked as ready
      expect(repository.update).toHaveBeenCalledTimes(3);
      expect(result.length).toBe(2);
      expect(result[0].status).toBe(TriggerStatus.READY);
      expect(result[1].status).toBe(TriggerStatus.READY);
    });

    it('should return empty array when no triggers are ready', async () => {
      // Arrange
      repository.find.mockResolvedValue([]);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      expect(result).toEqual([]);
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('should handle optimistic lock version mismatch errors', async () => {
      // Arrange
      repository.find.mockResolvedValue(mockTriggers);

      // Mock update to simulate optimistic lock conflict (affected: 0) for the first trigger
      repository.update.mockImplementation(
        async (
          criteria: FindOptionsWhere<TestTimeBasedTrigger>,
          _partial: QueryDeepPartialEntity<TestTimeBasedTrigger>
        ) => {
          if (criteria) {
            if ((criteria as FindOptionsWhere<TestTimeBasedTrigger>).id === 'trigger-1') {
              return { affected: 0 } as UpdateResult;
            }
            if ((criteria as FindOptionsWhere<TestTimeBasedTrigger>).id === 'trigger-2') {
              return { affected: 1 } as UpdateResult;
            }
          }
          return { affected: 0 } as UpdateResult;
        }
      );

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify both triggers were attempted to be updated
      expect(repository.update).toHaveBeenCalledTimes(3);

      // Verify only the second trigger was returned (first one had lock conflict)
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('trigger-2');
      expect(result[0].status).toBe(TriggerStatus.READY);

      // Verify the first trigger is not in the result array
      expect(result.find(t => t.id === 'trigger-1')).toBeUndefined();
    });

    it('should handle critical failures and return empty array', async () => {
      // Arrange
      const testError = new Error('Test error');
      repository.find.mockRejectedValue(testError);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify the query was attempted
      expect(repository.find).toHaveBeenCalled();

      // Verify an empty array is returned when an error occurs
      expect(result).toEqual([]);

      // Verify no triggers were updated
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('should handle non-optimistic lock errors during markTriggersAsReady and return empty array', async () => {
      // Arrange
      repository.find.mockResolvedValue([trigger1]);
      const testError = new Error('Non-optimistic lock error');

      // Mock update to throw a non-optimistic lock error
      repository.update.mockImplementation(
        async (
          criteria: FindOptionsWhere<TestTimeBasedTrigger>,
          _partial: QueryDeepPartialEntity<TestTimeBasedTrigger>
        ) => {
          if (criteria && (criteria as FindOptionsWhere<TestTimeBasedTrigger>).id === 'trigger-1') {
            throw testError;
          }
          return { affected: 0 } as UpdateResult;
        }
      );

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify triggers were fetched
      expect(repository.find).toHaveBeenCalled();

      // Verify update was attempted
      expect(repository.update).toHaveBeenCalled();

      // Verify an empty array is returned when an error occurs
      expect(result).toEqual([]);
    });
  });
});
