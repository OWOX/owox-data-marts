import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { Worker } from 'node:worker_threads';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { TooManyExecutionsError, type ActionInputError } from '../errors/plugin-action.errors';
import { ACTION_INPUT_AJV } from '../utils/action-input-schema.util';

const AJV_PATH = require.resolve('ajv/dist/2020');

/** Plain JS evaluated as is, so the worker runs the same under ts-jest, the Nest build and the CLI. */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const Ajv2020 = require(workerData.ajvPath).default;
const { ajv: setup, cacheSize, maxErrors } = workerData;
const compiled = new Map();

const reason = error => String((error && error.message) || error);

function build(schema) {
  const ajv = new Ajv2020(setup.options);
  ajv.getSchema(setup.metaSchema);
  for (const keyword of setup.refusedKeywords) ajv.removeKeyword(keyword);
  return ajv.compile(schema);
}

function compile(key, schema) {
  const cached = compiled.get(key);
  if (cached) {
    compiled.delete(key);
    compiled.set(key, cached);
    return cached;
  }
  const validate = build(schema);
  if (compiled.size >= cacheSize) compiled.delete(compiled.keys().next().value);
  compiled.set(key, validate);
  return validate;
}

// A release's schemas, as JSON text: the first one ajv refuses, or none. Not cached, it is no version yet.
function compileAll(schemas) {
  for (let index = 0; index < schemas.length; index += 1) {
    try {
      build(JSON.parse(schemas[index]));
    } catch (error) {
      return parentPort.postMessage({ schemaError: reason(error), index });
    }
  }
  parentPort.postMessage({ schemaError: null });
}

parentPort.on('message', message => {
  if (message.schemas) return compileAll(message.schemas);
  const { key, schema, input } = message;
  let validate;
  try {
    validate = compile(key, schema);
  } catch (error) {
    parentPort.postMessage({ schemaError: reason(error) });
    return;
  }
  parentPort.postMessage({ compiled: true });
  // A throw from here ends the worker, which the pool reads as an exceeded budget.
  const valid = validate(input);
  if (typeof valid !== 'boolean') {
    // An async schema answers a Promise: no verdict in time. It answers once settled, so its work stays
    // inside its own budget, and its rejection must not end the worker.
    return Promise.resolve(valid).catch(() => {}).then(() => parentPort.postMessage({ overBudget: true }));
  }
  if (valid) return parentPort.postMessage({ errors: [] });
  const errors = (validate.errors || []).slice(0, maxErrors).map(error => ({
    instancePath: error.instancePath,
    message: error.message || 'is invalid',
  }));
  parentPort.postMessage({
    errors: errors.length > 0 ? errors : [{ instancePath: '', message: 'is invalid' }],
  });
});

parentPort.postMessage({ ready: true });
`;

const OVER_BUDGET: readonly ActionInputError[] = [
  { instancePath: '', message: 'Input validation exceeded its budget' },
];

const COMPILE_OVER_BUDGET = 'Input schema compilation exceeded its budget';

/** A worker's answer to a job; the pool answers `overBudget` itself when it ends the worker. */
type Verdict =
  | { readonly errors: ActionInputError[] }
  | { readonly overBudget: true }
  | { readonly schemaError: string | null; readonly index?: number };

type WorkerReply = { readonly ready: true } | { readonly compiled: true } | Verdict;

interface Job {
  readonly message:
    | { key: string; schema: Record<string, unknown>; input: unknown }
    | { schemas: string[] };
  /** From readiness: a validation's compile allowance, or a compile job's whole budget. */
  readonly budgetMs: number;
  readonly resolve: (verdict: Verdict) => void;
  readonly reject: (error: Error) => void;
}

interface Slot {
  readonly worker: Worker;
  ready: boolean;
  job?: Job;
  timer?: NodeJS.Timeout;
}

export interface ActionInputSchema {
  /** Where the manifest declares it, which a refusal names. */
  readonly path: string;
  readonly schema: Record<string, unknown>;
}

function stoppedError(): Error {
  return new Error('Input validation stopped');
}

/** Validates and compiles in worker threads with a time and heap budget: ajv's cost is not bounded statically. */
@Injectable()
export class ActionInputValidatorService implements OnModuleDestroy {
  private readonly logger = new Logger(ActionInputValidatorService.name);
  private readonly slots = new Set<Slot>();
  private readonly queue: Job[] = [];
  /** Validations queued or running per version: starts always use the plugin's current version. */
  private readonly pendingByVersion = new Map<string, number>();
  private stopped = false;

  /** Each worker caches compiled schemas by version and action: a version's schemas never change. */
  validate(
    pluginVersionId: string,
    action: string,
    schema: Record<string, unknown>,
    input: unknown
  ): Promise<readonly ActionInputError[]> {
    return new Promise((resolve, reject) => {
      // Caps first: a queued job holds its parsed input, so one plugin must not fill the replica.
      const pending = this.pendingByVersion.get(pluginVersionId) ?? 0;
      if (pending >= PLUGIN_ACTION_LIMITS.maxValidationsPerVersion) {
        this.logger.warn(
          `TOO_MANY_EXECUTIONS: ${PLUGIN_ACTION_LIMITS.maxValidationsPerVersion} validations per version reached, pluginVersionId=${pluginVersionId}`
        );
        reject(
          new TooManyExecutionsError(
            'Too many inputs of this plugin are being validated. Try again shortly.'
          )
        );
        return;
      }
      const refusal = this.refuseToQueue(`pluginVersionId=${pluginVersionId}`);
      if (refusal) {
        reject(refusal);
        return;
      }
      this.pendingByVersion.set(pluginVersionId, pending + 1);
      const release = () => this.release(pluginVersionId);
      this.queue.push({
        message: { key: `${pluginVersionId}:${action}`, schema, input },
        budgetMs: PLUGIN_ACTION_LIMITS.validationBootMs,
        resolve: verdict => {
          release();
          if ('errors' in verdict) resolve(verdict.errors);
          else if ('overBudget' in verdict) resolve(OVER_BUDGET);
          else reject(new Error(String(verdict.schemaError)));
        },
        reject: error => {
          release();
          reject(error);
        },
      });
      this.drain();
    });
  }

  /** Compiles a release's input schemas within one budget, off the main thread: the first refusal, or null. */
  async compile(schemas: readonly ActionInputSchema[]): Promise<string | null> {
    if (schemas.length === 0) return null;
    // As text: postMessage copies recursively and gives up on nesting that JSON.stringify still measures.
    const texts: string[] = [];
    for (const { path, schema } of schemas) {
      try {
        texts.push(JSON.stringify(schema));
      } catch (error) {
        return `${path}: ${castError(error).message}`;
      }
    }
    return new Promise((resolve, reject) => {
      const refusal = this.refuseToQueue('release compile');
      if (refusal) {
        reject(refusal);
        return;
      }
      this.queue.push({
        message: { schemas: texts },
        budgetMs: PLUGIN_ACTION_LIMITS.inputSchemaCompileBudgetMs,
        resolve: verdict => {
          if ('overBudget' in verdict) resolve(COMPILE_OVER_BUDGET);
          else if ('schemaError' in verdict && verdict.schemaError !== null) {
            resolve(`${schemas[verdict.index ?? 0].path}: ${verdict.schemaError}`);
          } else resolve(null);
        },
        reject,
      });
      this.drain();
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    const slots = [...this.slots];
    this.slots.clear();
    for (const job of this.queue.splice(0)) job.reject(stoppedError());
    for (const slot of slots) {
      clearTimeout(slot.timer);
      slot.job?.reject(stoppedError());
    }
    await Promise.all(slots.map(slot => slot.worker.terminate()));
  }

  /** A queued job holds its parsed input or schemas, so the replica's queue is capped for every kind. */
  private refuseToQueue(subject: string): Error | null {
    if (this.queue.length >= PLUGIN_ACTION_LIMITS.maxQueuedValidations) {
      this.logger.warn(
        `TOO_MANY_EXECUTIONS: ${PLUGIN_ACTION_LIMITS.maxQueuedValidations} queued validations reached, ${subject}`
      );
      return new TooManyExecutionsError('Input validation is busy. Try again shortly.');
    }
    return this.stopped ? stoppedError() : null;
  }

  private drain(): void {
    for (const slot of this.slots) {
      const next = slot.job ? undefined : this.queue.shift();
      if (next) this.run(slot, next);
    }
    while (this.queue.length > 0 && this.slots.size < PLUGIN_ACTION_LIMITS.validationWorkers) {
      this.run(this.spawn(), this.queue.shift()!);
    }
  }

  private run(slot: Slot, job: Job): void {
    slot.job = job;
    // Referenced only while it holds a job, so an idle pool never keeps the process alive.
    slot.worker.ref();
    slot.worker.postMessage(job.message);
    if (slot.ready) this.startBudget(slot);
  }

  // From readiness, not from spawning, so a slow worker start is not charged to the job.
  private startBudget(slot: Slot, budgetMs = slot.job?.budgetMs): void {
    slot.timer = setTimeout(() => this.replace(slot), budgetMs);
  }

  private spawn(): Slot {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        ajvPath: AJV_PATH,
        ajv: ACTION_INPUT_AJV,
        cacheSize: PLUGIN_ACTION_LIMITS.validationWorkerCacheSize,
        maxErrors: PLUGIN_ACTION_LIMITS.maxReportedInputErrors,
      },
      resourceLimits: { maxOldGenerationSizeMb: PLUGIN_ACTION_LIMITS.validationWorkerHeapMb },
    });
    const slot: Slot = { worker, ready: false };
    // A worker that hangs while it boots raises no error or exit, and would hold its slot forever.
    // Queued messages run first: after a main-thread stall a ready worker's message trails its expired timer.
    slot.timer = setTimeout(
      () =>
        setImmediate(() => {
          if (!slot.ready) this.replace(slot);
        }),
      PLUGIN_ACTION_LIMITS.validationBootMs
    );
    worker.on('message', (reply: WorkerReply) => {
      if (!this.slots.has(slot)) return;
      clearTimeout(slot.timer);
      if ('ready' in reply) {
        slot.ready = true;
        if (slot.job) this.startBudget(slot);
        return;
      }
      // The input's budget starts once its schema is compiled, so a cold compile is not charged to it.
      if ('compiled' in reply) {
        this.startBudget(slot, PLUGIN_ACTION_LIMITS.validationBudgetMs);
        return;
      }
      const { job } = slot;
      slot.job = undefined;
      worker.unref();
      job?.resolve(reply);
      this.drain();
    });
    // Out of memory, a throw inside ajv, or any other exit.
    worker.on('error', error => this.replace(slot, error));
    worker.on('exit', () => this.replace(slot));
    // After the listeners: adding a 'message' listener references the worker again.
    worker.unref();
    this.slots.add(slot);
    return slot;
  }

  /** Ends a worker that ran past its budget or died; the next job gets a fresh one. */
  private replace(slot: Slot, error?: Error): void {
    if (!this.slots.delete(slot)) return;
    clearTimeout(slot.timer);
    const { job } = slot;
    slot.job = undefined;
    // Before it is ready a worker has run no publisher schema, so its failure is OWOX's own.
    if (slot.ready) job?.resolve({ overBudget: true });
    else job?.reject(error ?? new Error('The input validation worker did not start'));
    void slot.worker.terminate();
    this.drain();
  }

  private release(pluginVersionId: string): void {
    const pending = (this.pendingByVersion.get(pluginVersionId) ?? 1) - 1;
    if (pending > 0) this.pendingByVersion.set(pluginVersionId, pending);
    else this.pendingByVersion.delete(pluginVersionId);
  }
}
