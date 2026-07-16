import { FindOptionsWhere, Repository, UpdateResult } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Trigger } from '../../shared/entities/trigger.entity';
import { TriggerStatus } from '../../shared/entities/trigger-status';
import { TriggerHandler } from '../../shared/trigger-handler.interface';
import { SystemTimeService } from '../system-time.service';
import { GracefulShutdownService } from '../graceful-shutdown.service';
import { DirectTriggerRunnerService } from './direct-trigger-runner.service';

class TestTrigger extends Trigger {}
class RetryTrigger extends TestTrigger {
  override onSuccess(): void {
    if (this.status === TriggerStatus.IDLE) return;
    super.onSuccess();
  }
}

describe('AbstractTriggerRunnerService execution ownership', () => {
  it('admits only one worker when the same READY delivery arrives concurrently', async () => {
    const persisted = Object.assign(new TestTrigger(), {
      id: 'trigger-1',
      isActive: true,
      status: TriggerStatus.READY,
      version: 7,
      modifiedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
    const repository = {
      update: jest.fn(
        async (
          criteria: FindOptionsWhere<TestTrigger>,
          partial: QueryDeepPartialEntity<TestTrigger>
        ) => {
          const expected = criteria as Record<string, unknown>;
          if (
            expected.id !== persisted.id ||
            expected.status !== persisted.status ||
            expected.version !== persisted.version
          ) {
            return { affected: 0 } as UpdateResult;
          }
          persisted.status = partial.status as TriggerStatus;
          persisted.modifiedAt = partial.modifiedAt as Date;
          persisted.version += 1;
          return { affected: 1 } as UpdateResult;
        }
      ),
      save: jest.fn(async value => {
        Object.assign(persisted, value);
        persisted.version += 1;
        return value;
      }),
    } as unknown as jest.Mocked<Repository<TestTrigger>>;
    let releaseWorker!: () => void;
    const workerReleased = new Promise<void>(resolve => {
      releaseWorker = resolve;
    });
    let workerStarted!: () => void;
    const started = new Promise<void>(resolve => {
      workerStarted = resolve;
    });
    const handler = {
      handleTrigger: jest.fn(async () => {
        workerStarted();
        await workerReleased;
      }),
      getTriggerRepository: jest.fn(() => repository),
    } as unknown as TriggerHandler<TestTrigger>;
    const clock = {
      now: jest.fn().mockReturnValue(new Date('2026-07-16T10:00:01.000Z')),
    } as unknown as SystemTimeService;
    const shutdown = {
      isInShutdownMode: jest.fn().mockReturnValue(false),
      registerActiveProcess: jest.fn().mockReturnValue('process-1'),
      unregisterActiveProcess: jest.fn(),
    } as unknown as GracefulShutdownService;
    const runner = new DirectTriggerRunnerService(handler, clock, shutdown);
    const first = Object.assign(new TestTrigger(), { ...persisted });
    const duplicate = Object.assign(new TestTrigger(), { ...persisted });

    const running = runner.runTriggers([first, duplicate]);
    await started;
    await Promise.resolve();

    expect(handler.handleTrigger).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
    releaseWorker();
    await expect(running).resolves.toBeUndefined();
    expect(repository.save).not.toHaveBeenCalled();
    expect(persisted.status).toBe(TriggerStatus.SUCCESS);
  });

  it('does not let a stale completion overwrite a newer cancelling epoch', async () => {
    const persisted = Object.assign(new TestTrigger(), {
      id: 'trigger-1',
      isActive: true,
      status: TriggerStatus.READY,
      version: 7,
      modifiedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
    const repository = createAtomicRepository(persisted);
    let releaseWorker!: () => void;
    const released = new Promise<void>(resolve => {
      releaseWorker = resolve;
    });
    let workerStarted!: () => void;
    const started = new Promise<void>(resolve => {
      workerStarted = resolve;
    });
    const handler = createHandler(repository, async () => {
      workerStarted();
      await released;
    });
    const runner = createRunner(handler);
    const running = runner.runTriggers([Object.assign(new TestTrigger(), { ...persisted })]);
    await started;
    persisted.status = TriggerStatus.CANCELLING;
    persisted.version += 1;

    releaseWorker();
    await expect(running).resolves.toBeUndefined();

    expect(repository.save).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({ status: TriggerStatus.CANCELLING, version: 9 });
  });

  it('does not let stale error cleanup overwrite a recovered processing epoch', async () => {
    const persisted = Object.assign(new TestTrigger(), {
      id: 'trigger-1',
      isActive: true,
      status: TriggerStatus.READY,
      version: 7,
      modifiedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
    const repository = createAtomicRepository(persisted);
    let releaseWorker!: () => void;
    const released = new Promise<void>(resolve => {
      releaseWorker = resolve;
    });
    let workerStarted!: () => void;
    const started = new Promise<void>(resolve => {
      workerStarted = resolve;
    });
    const handler = createHandler(repository, async () => {
      workerStarted();
      await released;
      throw new Error('worker failed after its lease expired');
    });
    const runner = createRunner(handler);
    const running = runner.runTriggers([Object.assign(new TestTrigger(), { ...persisted })]);
    await started;
    persisted.status = TriggerStatus.PROCESSING;
    persisted.version += 3;

    releaseWorker();
    await expect(running).resolves.toBeUndefined();

    expect(repository.save).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({ status: TriggerStatus.PROCESSING, version: 11 });
  });

  it('does not persist a second completion after the handler atomically returns to IDLE', async () => {
    const persisted = Object.assign(new RetryTrigger(), {
      id: 'trigger-1',
      isActive: true,
      status: TriggerStatus.READY,
      version: 7,
      modifiedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
    const repository = createAtomicRepository(persisted);
    const handler = createHandler(repository, async trigger => {
      const { affected } = await repository.update(
        { id: trigger.id, status: TriggerStatus.PROCESSING, version: trigger.version },
        {
          status: TriggerStatus.IDLE,
          version: () => 'version + 1',
        }
      );
      expect(affected).toBe(1);
      trigger.status = TriggerStatus.IDLE;
      trigger.version += 1;
    });
    const runner = createRunner(handler);

    await runner.runTriggers([Object.assign(new RetryTrigger(), { ...persisted })]);

    expect(repository.save).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({ status: TriggerStatus.IDLE, version: 9 });
  });
});

function createAtomicRepository<T extends TestTrigger>(persisted: T): jest.Mocked<Repository<T>> {
  return {
    update: jest.fn(async (criteria: FindOptionsWhere<T>, partial: QueryDeepPartialEntity<T>) => {
      const expected = criteria as Record<string, unknown>;
      if (
        expected.id !== persisted.id ||
        expected.status !== persisted.status ||
        expected.version !== persisted.version
      ) {
        return { affected: 0 } as UpdateResult;
      }
      const update = partial as Record<string, unknown>;
      if (typeof update.status === 'string') persisted.status = update.status as TriggerStatus;
      if (typeof update.isActive === 'boolean') persisted.isActive = update.isActive;
      if (update.modifiedAt instanceof Date) persisted.modifiedAt = update.modifiedAt;
      const version = update.version;
      if (typeof version === 'function') {
        const expression = String(version());
        if (expression.includes('+ 1')) persisted.version += 1;
      } else {
        // Mirrors TypeORM's automatic @VersionColumn behavior for partial updates.
        persisted.version += 1;
      }
      return { affected: 1 } as UpdateResult;
    }),
    save: jest.fn(async value => {
      Object.assign(persisted, value);
      persisted.version += 1;
      return value;
    }),
  } as unknown as jest.Mocked<Repository<T>>;
}

function createHandler<T extends TestTrigger>(
  repository: jest.Mocked<Repository<T>>,
  handleTrigger: (trigger: T) => Promise<void>
): TriggerHandler<T> {
  return {
    handleTrigger: jest.fn(handleTrigger),
    getTriggerRepository: jest.fn(() => repository),
  } as unknown as TriggerHandler<T>;
}

function createRunner<T extends TestTrigger>(
  handler: TriggerHandler<T>
): DirectTriggerRunnerService<T> {
  const clock = {
    now: jest.fn().mockReturnValue(new Date('2026-07-16T10:00:01.000Z')),
  } as unknown as SystemTimeService;
  const shutdown = {
    isInShutdownMode: jest.fn().mockReturnValue(false),
    registerActiveProcess: jest.fn().mockReturnValue('process-1'),
    unregisterActiveProcess: jest.fn(),
  } as unknown as GracefulShutdownService;
  return new DirectTriggerRunnerService(handler, clock, shutdown);
}
