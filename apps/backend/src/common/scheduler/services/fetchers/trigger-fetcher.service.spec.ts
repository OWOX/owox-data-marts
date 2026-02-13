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
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    // Create service instance
    service = new TriggerFetcherService<TestTimeBasedTrigger>(
      repository,
      systemTimeService,
      0,
      0,
      new TimeBasedFetchStrategy<TestTimeBasedTrigger>(),
      undefined
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTriggersReadyForProcessing', () => {
    it('should fetch and claim triggers in chunks', async () => {
      // Arrange - return both triggers in first chunk (remaining = 100)
      repository.find.mockResolvedValueOnce([trigger1, trigger2]);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      expect(systemTimeService.now).toHaveBeenCalled();
      // Called once: got 2 triggers which is less than remaining (100), so early exit
      expect(repository.find).toHaveBeenCalledTimes(1);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            status: TriggerStatus.IDLE,
            nextRunTimestamp: LessThanOrEqual(mockCurrentTime),
          }),
          order: { nextRunTimestamp: 'ASC' },
          take: 100,
        })
      );

      // Verify each trigger was claimed individually
      expect(repository.update).toHaveBeenCalledTimes(2);
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
      expect(repository.update).toHaveBeenCalledTimes(0);
    });

    it('should skip trigger claimed by another instance and continue fetching', async () => {
      // Arrange - both triggers returned in first chunk, then empty on re-fetch
      repository.find.mockResolvedValueOnce([trigger1, trigger2]);

      // Mock update: trigger-1 loses optimistic lock, trigger-2 succeeds
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
      // Both triggers were attempted from the chunk
      expect(repository.update).toHaveBeenCalledTimes(2);

      // Only trigger-2 was successfully claimed
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('trigger-2');
      expect(result[0].status).toBe(TriggerStatus.READY);

      expect(result.find(t => t.id === 'trigger-1')).toBeUndefined();
    });

    it('should handle critical failures and return empty array', async () => {
      // Arrange
      const testError = new Error('Test error');
      repository.find.mockRejectedValue(testError);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      expect(repository.find).toHaveBeenCalled();
      expect(result).toEqual([]);
      expect(repository.update).toHaveBeenCalledTimes(0);
    });

    it('should handle errors during claim and return empty array', async () => {
      // Arrange
      repository.find.mockResolvedValueOnce([trigger1]);
      const testError = new Error('Non-optimistic lock error');

      // Mock update to throw an error
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
      expect(repository.find).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should stop at max iterations safeguard (limit * 3)', async () => {
      // Create service with batch limit of 2
      const limitedService = new TriggerFetcherService<TestTimeBasedTrigger>(
        repository,
        systemTimeService,
        0,
        0,
        new TimeBasedFetchStrategy<TestTimeBasedTrigger>(),
        2
      );

      // Arrange - always return triggers but never let claim succeed
      // This simulates extreme contention where every claim fails
      const stubbornTrigger1 = new TestTimeBasedTrigger(
        'stubborn-1',
        new Date('2023-01-01T11:00:00Z')
      );
      const stubbornTrigger2 = new TestTimeBasedTrigger(
        'stubborn-2',
        new Date('2023-01-01T11:00:00Z')
      );
      // Each fetch returns 2 triggers (remaining=2), all claims fail,
      // DB keeps returning same count so loop continues until safeguard
      repository.find.mockResolvedValue([stubbornTrigger1, stubbornTrigger2]);
      repository.update.mockResolvedValue({ affected: 0 } as UpdateResult);

      // Act
      const result = await limitedService.fetchTriggersReadyForProcessing();

      // Assert - should stop after limit * 3 = 6 iterations (chunk fetches)
      expect(result.length).toBe(0);
      expect(repository.find).toHaveBeenCalledTimes(6); // 2 * 3 = 6
      // Each chunk has 2 triggers, so 6 chunks * 2 updates = 12 updates
      expect(repository.update).toHaveBeenCalledTimes(12);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Reached max iterations safeguard')
      );
    });

    it('should respect processingBatchLimit', async () => {
      // Create service with batch limit of 1
      const limitedService = new TriggerFetcherService<TestTimeBasedTrigger>(
        repository,
        systemTimeService,
        0,
        0,
        new TimeBasedFetchStrategy<TestTimeBasedTrigger>(),
        1
      );

      // Arrange - return trigger1 (take=1 because remaining=1)
      repository.find.mockResolvedValueOnce([trigger1]);

      // Act
      const result = await limitedService.fetchTriggersReadyForProcessing();

      // Assert - should stop after claiming 1 trigger
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('trigger-1');
      // find called once with take=1, limit reached after first claim
      expect(repository.find).toHaveBeenCalledTimes(1);
      expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
      expect(repository.update).toHaveBeenCalledTimes(1);
    });
  });
});
