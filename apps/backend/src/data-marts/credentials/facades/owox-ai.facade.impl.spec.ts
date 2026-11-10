import { ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { RunKind } from '../../services/project-billing/project-billing.service';
import { OwoxAiFacadeImpl } from './owox-ai.facade.impl';

const context = { projectId: 'project-1', pluginId: 'plugin-1', pluginTitle: 'Plugin' };
const signal = new AbortController().signal;
const textDelta = { type: 'text-delta', id: 'text-1', delta: 'Hi' };
const finish = (unified: string) => ({
  type: 'finish',
  usage: { inputTokens: { total: 5 }, outputTokens: { total: 6 } },
  finishReason: { unified },
});

function streamOf(parts: readonly unknown[]): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      parts.forEach(part => controller.enqueue(part));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const parts: unknown[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

describe('OwoxAiFacadeImpl', () => {
  const languageModel = { modelId: 'language-model' };
  const embeddingModel = { modelId: 'embedding-model' };
  const models = {
    models: jest.fn(),
    languageModel: jest.fn(() => languageModel),
    embeddingModel: jest.fn(() => embeddingModel),
    failureLog: jest.fn((key: string) => ({ subject: `OWOX AI, model ${key}` })),
  };
  const ai = { generateWith: jest.fn(), streamWith: jest.fn(), embedWith: jest.fn() };
  const billing = {
    consumesBalance: jest.fn(),
    verifyCanPerformOperations: jest.fn(),
    registerPluginAiProcessRunConsumption: jest.fn(),
  };
  const facade = new OwoxAiFacadeImpl(models as never, ai as never, billing as never);

  beforeEach(() => {
    jest.clearAllMocks();
    models.models.mockReturnValue(['fast', 'reasoning', 'embedding']);
    billing.verifyCanPerformOperations.mockResolvedValue(undefined);
    billing.registerPluginAiProcessRunConsumption.mockResolvedValue(undefined);
  });

  it.each([[true], [false]])(
    'status reports billed as %s when billing consumes balance',
    billed => {
      billing.consumesBalance.mockReturnValue(billed);

      expect(facade.status()).toEqual({ models: ['fast', 'reasoning', 'embedding'], billed });
    }
  );

  it('provides is false for any model when OWOX AI is off', () => {
    models.models.mockReturnValue([]);

    expect(facade.provides([])).toBe(false);
    expect(facade.provides(['fast'])).toBe(false);
  });

  it('provides is false for embedding without an embedding model', () => {
    models.models.mockReturnValue(['fast', 'reasoning']);

    expect(facade.provides(['fast', 'reasoning'])).toBe(true);
    expect(facade.provides(['embedding'])).toBe(false);
    expect(facade.provides(['fast', 'embedding'])).toBe(false);
  });

  it('refuses a blocked project before it calls the provider', async () => {
    const blocked = new ProjectOperationBlockedException([
      ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED,
    ]);
    billing.verifyCanPerformOperations.mockRejectedValue(blocked);

    const error = await facade.generate(context, 'fast', { prompt: [] }, signal).catch(e => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as HttpException).getResponse()).toEqual({
      code: 'PROJECT_OPERATION_BLOCKED',
      message: blocked.message,
      errorDetails: { blockedReasons: [ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED] },
    });
    expect(billing.verifyCanPerformOperations).toHaveBeenCalledWith(
      'project-1',
      RunKind.AI_PROCESS_RUN
    );
    expect(ai.generateWith).not.toHaveBeenCalled();
  });

  // The plugin must not learn that OWOX AI, not a Credential, answers.
  it.each([
    ['generate', () => facade.generate(context, 'fast', { prompt: [] }, signal)],
    ['stream', () => facade.stream(context, 'fast', { prompt: [] }, signal)],
  ])('refuses %s when OWOX AI does not provide the model', async (_name, call) => {
    models.models.mockReturnValue([]);

    await expect(call()).rejects.toThrow(new NotFoundException('AI model fast is not available'));
    expect(billing.verifyCanPerformOperations).not.toHaveBeenCalled();
    expect(models.languageModel).not.toHaveBeenCalled();
    expect(ai.generateWith).not.toHaveBeenCalled();
    expect(ai.streamWith).not.toHaveBeenCalled();
  });

  it('refuses a model that OWOX AI does not provide, in neutral words', async () => {
    models.models.mockReturnValue(['fast', 'reasoning']);

    await expect(facade.embed(context, { values: ['a'] }, signal)).rejects.toThrow(
      new NotFoundException('AI model embedding is not available')
    );
    expect(billing.verifyCanPerformOperations).not.toHaveBeenCalled();
    expect(ai.embedWith).not.toHaveBeenCalled();
  });

  it('passes a plain authorization error through without a 403 or a provider call', async () => {
    const failure = new Error('Balance service is not available');
    billing.verifyCanPerformOperations.mockRejectedValue(failure);

    await expect(facade.generate(context, 'fast', { prompt: [] }, signal)).rejects.toBe(failure);
    expect(ai.generateWith).not.toHaveBeenCalled();
  });

  it('does not record when the provider call fails', async () => {
    const failure = new Error('provider down');
    ai.generateWith.mockRejectedValue(failure);
    ai.embedWith.mockRejectedValue(failure);

    await expect(facade.generate(context, 'fast', { prompt: [] }, signal)).rejects.toBe(failure);
    await expect(facade.embed(context, { values: ['a'] }, signal)).rejects.toBe(failure);

    expect(billing.registerPluginAiProcessRunConsumption).not.toHaveBeenCalled();
  });

  it('passes a source read failure to the consumer without a record', async () => {
    const failure = new Error('connection reset');
    ai.streamWith.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(textDelta);
        },
        pull() {
          throw failure;
        },
      })
    );
    const reader = (await facade.stream(context, 'fast', { prompt: [] }, signal)).getReader();

    await expect(reader.read()).resolves.toEqual({ done: false, value: textDelta });
    await expect(reader.read()).rejects.toBe(failure);
    expect(billing.registerPluginAiProcessRunConsumption).not.toHaveBeenCalled();
  });

  it('records input plus output tokens after a generate', async () => {
    const result = { usage: { inputTokens: { total: 40 }, outputTokens: { total: 2 } } };
    ai.generateWith.mockResolvedValue(result);

    await expect(facade.generate(context, 'reasoning', { prompt: [] }, signal)).resolves.toBe(
      result
    );

    expect(models.languageModel).toHaveBeenCalledWith('reasoning', signal);
    expect(ai.generateWith).toHaveBeenCalledWith(languageModel, { prompt: [] }, signal, {
      subject: 'OWOX AI, model reasoning',
    });
    expect(billing.registerPluginAiProcessRunConsumption).toHaveBeenCalledWith(42, context);
  });

  it('records zero tokens when the provider reports no usage', async () => {
    ai.generateWith.mockResolvedValue({ content: [], usage: undefined });

    await facade.generate(context, 'fast', { prompt: [] }, signal);

    expect(billing.registerPluginAiProcessRunConsumption).toHaveBeenCalledWith(0, context);
  });

  it('records an embed with its input tokens', async () => {
    const result = { embeddings: [[0.1]], usage: { tokens: 7 } };
    ai.embedWith.mockResolvedValue(result);

    await expect(facade.embed(context, { values: ['a'] }, signal)).resolves.toBe(result);

    expect(models.embeddingModel).toHaveBeenCalledWith(signal);
    expect(ai.embedWith).toHaveBeenCalledWith(embeddingModel, { values: ['a'] }, signal, {
      subject: 'OWOX AI, model embedding',
    });
    expect(billing.registerPluginAiProcessRunConsumption).toHaveBeenCalledWith(7, context);
  });

  it('records a stream once, when its finish part arrives', async () => {
    const parts = [textDelta, finish('stop')];
    ai.streamWith.mockResolvedValue(streamOf(parts));

    const stream = await facade.stream(context, 'fast', { prompt: [] }, signal);
    expect(billing.registerPluginAiProcessRunConsumption).not.toHaveBeenCalled();

    await expect(drain(stream)).resolves.toEqual(parts);
    expect(ai.streamWith).toHaveBeenCalledWith(languageModel, { prompt: [] }, signal, {
      subject: expect.stringMatching(/^OWOX AI, model /),
    });
    expect(billing.registerPluginAiProcessRunConsumption).toHaveBeenCalledTimes(1);
    expect(billing.registerPluginAiProcessRunConsumption).toHaveBeenCalledWith(11, context);
  });

  it('hides the model ID and the provider response ID from stream parts', async () => {
    const metadata = { type: 'response-metadata', id: 'gen-1', modelId: 'vendor/model' };
    ai.streamWith.mockResolvedValue(streamOf([metadata, textDelta, finish('stop')]));

    const parts = await drain(await facade.stream(context, 'fast', { prompt: [] }, signal));

    expect(parts[0]).toEqual({ type: 'response-metadata' });
  });

  it('does not record a stream that ends with an error finish reason', async () => {
    ai.streamWith.mockResolvedValue(streamOf([textDelta, finish('error')]));

    await drain(await facade.stream(context, 'fast', { prompt: [] }, signal));

    expect(billing.registerPluginAiProcessRunConsumption).not.toHaveBeenCalled();
  });

  it('does not record a stream that the caller cancels before the finish part', async () => {
    const cancel = jest.fn();
    ai.streamWith.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(textDelta);
          controller.enqueue(finish('stop'));
        },
        cancel,
      })
    );
    const reader = (await facade.stream(context, 'fast', { prompt: [] }, signal)).getReader();

    await expect(reader.read()).resolves.toEqual({ done: false, value: textDelta });
    await expect(reader.cancel('stop')).resolves.toBeUndefined();
    await expect(reader.closed).resolves.toBeUndefined();

    expect(cancel).toHaveBeenCalledWith('stop');
    expect(billing.registerPluginAiProcessRunConsumption).not.toHaveBeenCalled();
  });

  it('returns the result when recording fails', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const failure = new Error('Balance service is not available');
    billing.registerPluginAiProcessRunConsumption.mockRejectedValue(failure);
    const result = { embeddings: [[0.1]], usage: { tokens: 1 } };
    ai.embedWith.mockResolvedValue(result);

    await expect(facade.embed(context, { values: ['a'] }, signal)).resolves.toBe(result);
    // The facade attached its catch first, so it has logged when this await resumes.
    await (
      billing.registerPluginAiProcessRunConsumption.mock.results[0].value as Promise<void>
    ).catch(() => undefined);

    expect(logError).toHaveBeenCalledWith(expect.any(String), failure);
    logError.mockRestore();
  });
});
