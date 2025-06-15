/* eslint-disable @typescript-eslint/no-explicit-any */
// Using 'any' type to access private properties for testing purposes
import { Test, TestingModule } from '@nestjs/testing';
import { GracefulShutdownService } from './graceful-shutdown.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

describe('GracefulShutdownService', () => {
  let service: GracefulShutdownService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Create mock config service
    configService = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        if (key === 'SCHEDULER_GRACEFUL_SHUTDOWN_TIMEOUT_MINUTES') {
          return 5; // Mock timeout value for testing
        }
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    // Mock logger methods to prevent console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GracefulShutdownService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<GracefulShutdownService>(GracefulShutdownService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with the configured timeout value', () => {
      // Assert
      expect(configService.get).toHaveBeenCalledWith(
        'SCHEDULER_GRACEFUL_SHUTDOWN_TIMEOUT_MINUTES',
        15
      );
      // Access private property for testing
      expect((service as any).shutdownTimeoutMinutes).toBe(5);
    });
  });

  describe('isInShutdownMode', () => {
    it('should return false by default', () => {
      // Act
      const result = service.isInShutdownMode();

      // Assert
      expect(result).toBe(false);
    });

    it('should return true after shutdown is initiated', async () => {
      // Act
      const shutdownPromise = service.initiateShutdown();
      const result = service.isInShutdownMode();

      // Assert
      expect(result).toBe(true);

      // Clean up
      service.completeShutdown();
      await shutdownPromise;
    });
  });

  describe('registerActiveProcess', () => {
    it('should register a process and return the process ID', () => {
      // Arrange
      const processId = 'test-process-1';

      // Act
      const result = service.registerActiveProcess(processId);

      // Assert
      expect(result).toBe(processId);
      // Verify the process was added to the activeProcesses map
      expect((service as any).activeProcesses.has(processId)).toBe(true);
      expect((service as any).activeProcesses.size).toBe(1);

      // Verify the process data structure
      const processData = (service as any).activeProcesses.get(processId);
      expect(processData.id).toBe(processId);
      expect(processData.startTime).toBeInstanceOf(Date);
    });
  });

  describe('unregisterActiveProcess', () => {
    it('should unregister a process', () => {
      // Arrange
      const processId = 'test-process-1';
      service.registerActiveProcess(processId);

      // Verify process was registered
      expect((service as any).activeProcesses.has(processId)).toBe(true);
      expect((service as any).activeProcesses.size).toBe(1);

      // Act
      service.unregisterActiveProcess(processId);

      // Assert
      expect((service as any).activeProcesses.has(processId)).toBe(false);
      expect((service as any).activeProcesses.size).toBe(0);
    });

    it('should complete shutdown if no active processes remain during shutdown', async () => {
      // Arrange
      jest.useFakeTimers();
      const processId = 'test-process-1';
      service.registerActiveProcess(processId);
      const shutdownPromise = service.initiateShutdown();

      // Verify shutdown is initiated but not completed
      expect(service.isInShutdownMode()).toBe(true);
      expect((service as any).shutdownResolve).not.toBeNull();

      // Act
      service.unregisterActiveProcess(processId);

      // Assert
      // Verify process was removed
      expect((service as any).activeProcesses.has(processId)).toBe(false);
      expect((service as any).activeProcesses.size).toBe(0);

      // Verify shutdown was completed (shutdownResolve should be null after completion)
      expect((service as any).shutdownResolve).toBeNull();

      // Verify promise resolves
      await expect(shutdownPromise).resolves.toBeUndefined();

      // Clean up
      jest.clearAllTimers();
    });

    it('should do nothing if process ID does not exist', () => {
      // Arrange
      const initialSize = (service as any).activeProcesses.size;

      // Act
      service.unregisterActiveProcess('non-existent-process');

      // Assert
      expect((service as any).activeProcesses.size).toBe(initialSize);
    });
  });

  describe('initiateShutdown', () => {
    it('should resolve immediately if no active processes', async () => {
      // Act
      const promise = service.initiateShutdown();

      // Assert
      expect(service.isInShutdownMode()).toBe(true);
      // Verify the promise resolves immediately (no need for shutdownResolve)
      expect((service as any).shutdownResolve).toBeNull();
      await expect(promise).resolves.toBeUndefined();
    });

    it('should force shutdown after timeout if processes still active', async () => {
      // Arrange
      jest.useFakeTimers();
      const processId = 'test-process-1';
      service.registerActiveProcess(processId);

      // Act
      const shutdownPromise = service.initiateShutdown();

      // Verify shutdown is initiated
      expect(service.isInShutdownMode()).toBe(true);
      expect((service as any).shutdownResolve).not.toBeNull();

      // Verify process is still active
      expect((service as any).activeProcesses.size).toBe(1);

      // Fast-forward time
      jest.advanceTimersByTime(5 * 60 * 1000 + 100); // Timeout + a little extra

      // Assert
      // Verify the promise resolves even though the process is still active
      await expect(shutdownPromise).resolves.toBeUndefined();

      // Process should still be in the map (timeout forces shutdown without removing processes)
      expect((service as any).activeProcesses.size).toBe(1);

      // Note: After the timeout, the shutdownResolve function is called but not set to null
      // This is because completeShutdown() is not called by the timeout handler

      // Clean up
      jest.clearAllTimers();
    });
  });

  describe('completeShutdown', () => {
    it('should complete the shutdown process', async () => {
      // Arrange
      jest.useFakeTimers();
      const processId = 'test-process-1';
      service.registerActiveProcess(processId);
      const shutdownPromise = service.initiateShutdown();

      // Verify shutdown is initiated but not completed
      expect(service.isInShutdownMode()).toBe(true);
      expect((service as any).shutdownResolve).not.toBeNull();

      // Act
      service.completeShutdown();

      // Assert
      // Verify shutdownResolve is null after completion
      expect((service as any).shutdownResolve).toBeNull();

      // Verify promise resolves
      await expect(shutdownPromise).resolves.toBeUndefined();

      // Clean up
      jest.clearAllTimers();
    });

    it('should do nothing if not in shutdown mode', () => {
      // Arrange
      // Set up a spy to verify the shutdownResolve function is not called
      const mockResolve = jest.fn();
      (service as any).isShuttingDown = false;
      (service as any).shutdownResolve = mockResolve;

      // Act
      service.completeShutdown();

      // Assert
      expect(mockResolve).not.toHaveBeenCalled();
      expect((service as any).shutdownResolve).toBe(mockResolve); // Should not be changed
    });
  });

  describe('onModuleDestroy', () => {
    it('should initiate shutdown', async () => {
      // Arrange
      const initiateShutdownSpy = jest.spyOn(service, 'initiateShutdown');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(initiateShutdownSpy).toHaveBeenCalled();
    });
  });
});
