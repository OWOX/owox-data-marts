import { TimeBasedTriggerFetcherService } from './time-based-trigger-fetcher.service';
import { SystemTimeService } from '../system-time.service';
import { TimeBasedTrigger, TriggerStatus } from '../../shared/entities/time-based-trigger.entity';
import { OptimisticLockVersionMismatchError, Repository, SelectQueryBuilder } from 'typeorm';
import { Logger } from '@nestjs/common';

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
  let service: TimeBasedTriggerFetcherService<TestTimeBasedTrigger>;
  let repository: jest.Mocked<Repository<TestTimeBasedTrigger>>;
  let systemTimeService: jest.Mocked<SystemTimeService>;

  const mockCurrentTime = new Date('2023-01-01T12:00:00Z');
  const mockTriggers = [
    new TestTimeBasedTrigger('trigger-1', new Date('2023-01-01T11:00:00Z')),
    new TestTimeBasedTrigger('trigger-2', new Date('2023-01-01T11:30:00Z')),
  ];

  let mockQueryBuilder: Partial<SelectQueryBuilder<TestTimeBasedTrigger>> & {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    // Create mock query builder
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    // Create mock repository
    repository = {
      metadata: { name: 'TestTimeBasedTrigger' },
      save: jest.fn().mockImplementation(async entity => entity as TestTimeBasedTrigger),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
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
    service = new TimeBasedTriggerFetcherService<TestTimeBasedTrigger>(
      repository,
      systemTimeService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTriggersReadyForProcessing', () => {
    it('should fetch and mark triggers as ready for processing', async () => {
      // Arrange
      mockQueryBuilder.getMany.mockResolvedValue(mockTriggers);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify the query was built correctly
      expect(systemTimeService.now).toHaveBeenCalled();
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('t.nextRunTimestamp IS NOT NULL');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('t.nextRunTimestamp <= :currentTime', {
        currentTime: mockCurrentTime,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('t.isActive = true');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('t.status = :status', {
        status: TriggerStatus.IDLE,
      });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('t.nextRunTimestamp', 'ASC');
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();

      // Verify the triggers were marked as ready
      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(2);
      expect(result[0].status).toBe(TriggerStatus.READY);
      expect(result[1].status).toBe(TriggerStatus.READY);
    });

    it('should return empty array when no triggers are ready', async () => {
      // Arrange
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      expect(result).toEqual([]);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should handle optimistic lock version mismatch errors', async () => {
      // Arrange
      mockQueryBuilder.getMany.mockResolvedValue(mockTriggers);

      // Mock save to throw OptimisticLockVersionMismatchError for the first trigger
      repository.save.mockImplementation(async trigger => {
        if ((trigger as TestTimeBasedTrigger).id === 'trigger-1') {
          throw new OptimisticLockVersionMismatchError('TestTimeBasedTrigger', 1, 2);
        }
        return trigger as TestTimeBasedTrigger;
      });

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify both triggers were attempted to be saved
      expect(repository.save).toHaveBeenCalledTimes(2);

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
      mockQueryBuilder.getMany.mockRejectedValue(testError);

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify the query was attempted
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();

      // Verify an empty array is returned when an error occurs
      expect(result).toEqual([]);

      // Verify no triggers were saved
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should handle non-optimistic lock errors during markTriggersAsReady and return empty array', async () => {
      // Arrange
      mockQueryBuilder.getMany.mockResolvedValue(mockTriggers);
      const testError = new Error('Non-optimistic lock error');

      // Mock save to throw a non-optimistic lock error
      repository.save.mockImplementation(async () => {
        throw testError;
      });

      // Act
      const result = await service.fetchTriggersReadyForProcessing();

      // Assert
      // Verify triggers were fetched
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();

      // Verify save was attempted
      expect(repository.save).toHaveBeenCalled();

      // Verify an empty array is returned when an error occurs
      expect(result).toEqual([]);
    });
  });
});
