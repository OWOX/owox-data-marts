import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { TooManyExecutionsError } from '../errors/plugin-action.errors';
import { ActionInputValidatorService, isOverBudget } from './action-input-validator.service';

// The same object the service reads `Worker` from, so a test can stand in a worker that never starts.
const workerThreads =
  jest.requireActual<typeof import('node:worker_threads')>('node:worker_threads');

const DOCUMENT_INPUT = {
  type: 'object',
  properties: { documentId: { type: 'string' } },
  required: ['documentId'],
  additionalProperties: false,
};
const STRING = { type: 'string' };
const NUMBER = { type: 'number' };
const OVER_BUDGET = [{ instancePath: '', message: 'Input validation exceeded its budget' }];
const MUST_BE_NUMBER = [{ instancePath: '', message: 'must be number' }];

const PLUGIN_BUSY = 'Too many inputs of this plugin are being validated. Try again shortly.';
const REPLICA_BUSY = 'Input validation is busy. Try again shortly.';

const fill = <T>(length: number, value: T): T[] => Array.from({ length }, () => value);
const SLOW = { type: 'array', items: { anyOf: [...fill(1997, false), true] } };
const SLOW_INPUT = fill(131_000, 0);
const OUT_OF_MEMORY = { type: 'array', items: { allOf: fill(1998, false) } };
const OUT_OF_MEMORY_INPUT = fill(30_000, 0);

async function expectTooMany(validation: Promise<unknown>, message: string): Promise<void> {
  const refusal = await validation.catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(TooManyExecutionsError);
  expect(refusal).toMatchObject({ httpStatus: 429, code: 'TOO_MANY_EXECUTIONS', message });
}

describe('ActionInputValidatorService', () => {
  let validator: ActionInputValidatorService;

  beforeEach(() => {
    validator = new ActionInputValidatorService();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await validator.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('accepts input that matches the schema', async () => {
    await expect(
      validator.validate('version-1', 'update-document', DOCUMENT_INPUT, { documentId: 'd1' })
    ).resolves.toEqual([]);
  });

  it('says where and why input does not match', async () => {
    await expect(
      validator.validate('version-1', 'update-document', DOCUMENT_INPUT, { documentId: 1 })
    ).resolves.toEqual([{ instancePath: '/documentId', message: 'must be string' }]);
  });

  it('requires an own property, not one inherited from Object.prototype', async () => {
    const schema = { type: 'object', properties: { toString: {} }, required: ['toString'] };

    await expect(validator.validate('version-1', 'run', schema, {})).resolves.toEqual([
      { instancePath: '', message: "must have required property 'toString'" },
    ]);
  });

  it('counts an async answer as over budget, and its worker survives the rejection', async () => {
    const terminate = jest.spyOn(Worker.prototype, 'terminate');

    await expect(
      validator.validate('version-1', 'run', { $async: true, type: 'string' }, 1)
    ).resolves.toEqual(OVER_BUDGET);
    await expect(validator.validate('version-2', 'run', NUMBER, 1)).resolves.toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(terminate).not.toHaveBeenCalled();
  });

  it('tells its over-budget answer from the errors of a schema', async () => {
    const overBudget = await validator.validate('version-1', 'run', { $async: true }, 1);
    const invalid = await validator.validate('version-2', 'run', NUMBER, 'one');

    expect(invalid).toEqual(MUST_BE_NUMBER);
    expect(isOverBudget(overBudget)).toBe(true);
    expect(isOverBudget(invalid)).toBe(false);
    // A schema cannot answer it: only the answer itself counts, not an equal list.
    expect(isOverBudget(OVER_BUDGET)).toBe(false);
  });

  it('answers an async schema only once its work has settled, so the next validation is not refused', async () => {
    const terminate = jest.spyOn(Worker.prototype, 'terminate');
    // Async refs run on, after the first answer, in a worker that would already hold the next job.
    const slowAfterAwait = {
      $async: true,
      $defs: { ok: { $async: true, type: 'number' }, slow: { $async: true, ...SLOW } },
      allOf: [{ $ref: '#/$defs/ok' }, { $ref: '#/$defs/slow' }],
    };

    // About 10 ms of work, far inside the budget even on a loaded CI runner: the answer is the
    // settled one, not the budget's.
    await expect(
      validator.validate('version-1', 'run', slowAfterAwait, fill(50, 0))
    ).resolves.toEqual(OVER_BUDGET);
    await expect(validator.validate('version-2', 'run', NUMBER, 1)).resolves.toEqual([]);
    expect(terminate).not.toHaveBeenCalled();
  });

  it('refuses the keywords the release check refuses', async () => {
    await expect(
      validator.validate('version-1', 'run', { type: 'string', pattern: 'x' }, 'x')
    ).rejects.toThrow('strict mode: unknown keyword: "pattern"');
  });

  it('reports at most 20 errors', async () => {
    const errors = await validator.validate(
      'version-1',
      'tag-documents',
      { type: 'array', items: STRING },
      Array.from({ length: 25 }, (_, index) => index)
    );

    expect(errors).toHaveLength(PLUGIN_ACTION_LIMITS.maxReportedInputErrors);
    expect(errors[0]).toEqual({ instancePath: '/0', message: 'must be string' });
  });

  // A cached key keeps its first schema, so a second schema shows whether it compiled again.
  it('compiles a schema once per version and action', async () => {
    await validator.validate('version-1', 'run', NUMBER, 1);

    await expect(validator.validate('version-1', 'run', STRING, 1)).resolves.toEqual([]);
    await expect(validator.validate('version-2', 'run', STRING, 1)).resolves.toEqual([
      { instancePath: '', message: 'must be string' },
    ]);
  });

  it('keeps a schema in use and drops the least recently used once 50 are cached', async () => {
    for (let index = 0; index < PLUGIN_ACTION_LIMITS.validationWorkerCacheSize; index += 1) {
      await validator.validate(`version-${index}`, 'run', STRING, 'x');
    }
    await validator.validate('version-0', 'run', STRING, 'x');
    await validator.validate('version-new', 'run', STRING, 'x');

    await expect(validator.validate('version-0', 'run', NUMBER, 'x')).resolves.toEqual([]);
    await expect(validator.validate('version-1', 'run', NUMBER, 'x')).resolves.toEqual(
      MUST_BE_NUMBER
    );
  });

  it('refuses a validation that runs past its budget, then validates again', async () => {
    const startedAt = Date.now();

    await expect(validator.validate('version-1', 'run', SLOW, SLOW_INPUT)).resolves.toEqual(
      OVER_BUDGET
    );
    expect(Date.now() - startedAt).toBeLessThan(5000);
    await expect(validator.validate('version-1', 'run', NUMBER, 'x')).resolves.toEqual(
      MUST_BE_NUMBER
    );
  });

  it('refuses a validation whose worker runs out of memory, then validates again', async () => {
    await expect(
      validator.validate('version-1', 'run', OUT_OF_MEMORY, OUT_OF_MEMORY_INPUT)
    ).resolves.toEqual(OVER_BUDGET);
    await expect(validator.validate('version-2', 'run', NUMBER, 'x')).resolves.toEqual(
      MUST_BE_NUMBER
    );
  });

  it('does not hold up a validation behind one that runs past its budget', async () => {
    const settled: string[] = [];
    const slow = validator.validate('version-1', 'slow', SLOW, SLOW_INPUT).then(errors => {
      settled.push('slow');
      return errors;
    });

    await expect(validator.validate('version-1', 'fast', NUMBER, 'x')).resolves.toEqual(
      MUST_BE_NUMBER
    );
    settled.push('fast');

    await expect(slow).resolves.toEqual(OVER_BUDGET);
    expect(settled).toEqual(['fast', 'slow']);
  });

  it('terminates its workers on shutdown and settles what is still running', async () => {
    const terminate = jest.spyOn(Worker.prototype, 'terminate');
    const running = expect(
      validator.validate('version-1', 'run', SLOW, SLOW_INPUT)
    ).rejects.toThrow('Input validation stopped');
    await new Promise(resolve => setTimeout(resolve, 100));

    await validator.onModuleDestroy();

    expect(terminate).toHaveBeenCalledTimes(1);
    await running;
    await expect(validator.validate('version-1', 'run', NUMBER, 1)).rejects.toThrow(
      'Input validation stopped'
    );
  });

  it('refuses a fifth validation of one version at once, while another version validates', async () => {
    const running = fill(4, null).map((_, index) =>
      validator.validate('version-1', `run-${index}`, NUMBER, 1)
    );

    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expectTooMany(validator.validate('version-1', 'run-4', NUMBER, 1), PLUGIN_BUSY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('TOO_MANY_EXECUTIONS');
    expect(warn.mock.calls[0][0]).toContain('version-1');
    await expect(validator.validate('version-2', 'run', NUMBER, 1)).resolves.toEqual([]);
    await expect(Promise.all(running)).resolves.toEqual(fill(4, []));
  });

  it('refuses a validation once 64 are waiting', async () => {
    const running = [
      validator.validate('slow-1', 'run', SLOW, SLOW_INPUT),
      validator.validate('slow-2', 'run', SLOW, SLOW_INPUT),
    ];
    const waiting = fill(PLUGIN_ACTION_LIMITS.maxQueuedValidations, null).map((_, index) =>
      validator.validate(`version-${index % 16}`, `run-${index}`, NUMBER, 1)
    );

    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const secret = 'secret-input-value';

    await expectTooMany(validator.validate('version-new', 'run', NUMBER, secret), REPLICA_BUSY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(warn.mock.calls[0][0]).toContain('TOO_MANY_EXECUTIONS');
    expect(warn.mock.calls[0][0]).toContain('version-new');
    await expect(Promise.all(running)).resolves.toEqual([OVER_BUDGET, OVER_BUDGET]);
    await expect(Promise.all(waiting)).resolves.toHaveLength(64);
  });

  it.each([
    ['an answer', NUMBER, 1],
    ['a refused schema', { type: 'string', pattern: 'x' }, 'x'],
    ['a budget refusal', SLOW, SLOW_INPUT],
    ['a worker crash', OUT_OF_MEMORY, OUT_OF_MEMORY_INPUT],
  ])('frees a version for new validations after %s', async (_label, schema, input) => {
    await Promise.allSettled(
      fill(4, null).map((_, index) =>
        validator.validate('version-1', `run-${index}`, schema, input)
      )
    );

    await expect(validator.validate('version-1', 'next', NUMBER, 1)).resolves.toEqual([]);
  });

  // The per-version check runs before the stopped one, so a slot leaked by shutdown would show as 429.
  it('frees a version on shutdown', async () => {
    const validations = fill(4, null).map((_, index) =>
      validator.validate('version-1', `run-${index}`, SLOW, SLOW_INPUT).catch(() => undefined)
    );

    await validator.onModuleDestroy();
    await Promise.all(validations);

    await expect(validator.validate('version-1', 'next', NUMBER, 1)).rejects.toThrow(
      'Input validation stopped'
    );
  });

  describe('compile', () => {
    it('answers null when every schema compiles, and names the first one ajv refuses', async () => {
      await expect(
        validator.compile([
          { path: 'a', schema: NUMBER },
          { path: 'b', schema: DOCUMENT_INPUT },
        ])
      ).resolves.toBeNull();
      await expect(
        validator.compile([
          { path: 'a', schema: NUMBER },
          { path: 'b', schema: { type: 'string', pattern: 'x' } },
          { path: 'c', schema: { type: 'string', format: 'email' } },
        ])
      ).resolves.toBe('b: strict mode: unknown keyword: "pattern"');
    });

    it('compiles without caching, so a later version with the same schema compiles again', async () => {
      await validator.compile([{ path: 'a', schema: NUMBER }]);

      await expect(validator.validate('version-1', 'run', STRING, 1)).resolves.toEqual([
        { instancePath: '', message: 'must be string' },
      ]);
    });

    // Structured clone gives up at about 3,000 levels, below what JSON.stringify measures.
    it('refuses a schema too deep to copy to a worker, naming it', async () => {
      let deep: Record<string, unknown> = { type: 'string' };
      for (let level = 0; level < 5000; level += 1) deep = { a: deep };

      await expect(validator.compile([{ path: 'a', schema: deep }])).resolves.toMatch(/^a: /);
      await expect(validator.compile([{ path: 'b', schema: NUMBER }])).resolves.toBeNull();
    });

    it('waits in the replica queue, and is refused once 64 are waiting', async () => {
      const running = [
        validator.validate('slow-1', 'run', SLOW, SLOW_INPUT),
        validator.validate('slow-2', 'run', SLOW, SLOW_INPUT),
      ];
      const waiting = fill(PLUGIN_ACTION_LIMITS.maxQueuedValidations, null).map((_, index) =>
        validator.validate(`version-${index % 16}`, `run-${index}`, NUMBER, 1)
      );
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expectTooMany(validator.compile([{ path: 'a', schema: NUMBER }]), REPLICA_BUSY);
      await Promise.all([...running, ...waiting]);
    });
  });

  it('rejects a validation whose worker never becomes ready, as a server error', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const worker = Object.assign(new EventEmitter(), {
      postMessage: jest.fn(),
      ref: jest.fn(),
      unref: jest.fn(),
      terminate: jest.fn().mockResolvedValue(1),
    });
    jest.spyOn(workerThreads, 'Worker').mockImplementation(() => worker as unknown as Worker);
    const validation = validator.validate('version-1', 'run', NUMBER, 1).catch(error => error);

    jest.advanceTimersByTime(PLUGIN_ACTION_LIMITS.validationBootMs);

    await expect(validation).resolves.toEqual(
      new Error('The input validation worker did not start')
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  function fakeWorker() {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const worker = Object.assign(new EventEmitter(), {
      postMessage: jest.fn(),
      ref: jest.fn(),
      unref: jest.fn(),
      terminate: jest.fn().mockResolvedValue(1),
    });
    jest.spyOn(workerThreads, 'Worker').mockImplementation(() => worker as unknown as Worker);
    return worker;
  }

  // Simulated: on a fast CPU, a schema that compiles for 500 ms exhausts the worker's 64 MB heap first.
  it('passes an input whose schema takes longer than 500 ms to compile', async () => {
    const worker = fakeWorker();
    const validation = validator.validate('version-1', 'run', NUMBER, 1);
    worker.emit('message', { ready: true });

    jest.advanceTimersByTime(PLUGIN_ACTION_LIMITS.validationBootMs - 1);
    worker.emit('message', { compiled: true });
    worker.emit('message', { errors: [] });

    await expect(validation).resolves.toEqual([]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('gives the input its 500 ms once its schema is compiled', async () => {
    const worker = fakeWorker();
    const validation = validator.validate('version-1', 'run', NUMBER, 1);
    worker.emit('message', { ready: true });
    worker.emit('message', { compiled: true });

    jest.advanceTimersByTime(PLUGIN_ACTION_LIMITS.validationBudgetMs - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    await expect(validation).resolves.toEqual(OVER_BUDGET);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('refuses a compile that runs past 2 seconds or ends its worker', async () => {
    const worker = fakeWorker();
    const slow = validator.compile([{ path: 'a', schema: NUMBER }]);
    worker.emit('message', { ready: true });

    jest.advanceTimersByTime(PLUGIN_ACTION_LIMITS.inputSchemaCompileBudgetMs - 1);
    expect(worker.terminate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await expect(slow).resolves.toBe('Input schema compilation exceeded its budget');

    const crashed = validator.compile([{ path: 'a', schema: NUMBER }]);
    worker.emit('message', { ready: true });
    worker.emit('exit', 1);
    await expect(crashed).resolves.toBe('Input schema compilation exceeded its budget');
  });

  it('keeps a worker that became ready as the boot deadline fired', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const worker = Object.assign(new EventEmitter(), {
      postMessage: jest.fn(),
      ref: jest.fn(),
      unref: jest.fn(),
      terminate: jest.fn().mockResolvedValue(1),
    });
    jest.spyOn(workerThreads, 'Worker').mockImplementation(() => worker as unknown as Worker);
    const validation = validator.validate('version-1', 'run', NUMBER, 1);

    // After a main-thread stall the expired timer runs before the queued 'ready' message.
    jest.advanceTimersByTime(PLUGIN_ACTION_LIMITS.validationBootMs);
    worker.emit('message', { ready: true });
    await new Promise(resolve => setImmediate(resolve));
    worker.emit('message', { errors: [] });

    await expect(validation).resolves.toEqual([]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });
});
