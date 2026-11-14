import { BadGatewayException, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { InvalidResponseDataError } from '@ai-sdk/provider';
import { WorkersAiDecisionModel } from './workers-ai-decision-model';

const BASE_URL = 'https://api.cloudflare.com/client/v4/accounts/acc/ai';
const MODEL_ID = '@cf/cloudflare/clef-flash';

const unifiedResponse = {
  result: {
    model: 'clef-flash',
    answers: {
      component: {
        type: 'choice',
        choice: 'line_chart',
        probabilities: {
          line_chart: 0.9421,
          bar_chart: 0.0254,
          table: 0.0156,
          kpi_card: 0.0077,
          pie_chart: 0.0092,
        },
        confidence: 0.8607,
      },
      time_axis: { type: 'noul', noul: 0.9591 },
      complexity: {
        type: 'score',
        score: 0.5768,
        legend: { '0': 'Simple', '1': 'Moderate', '2': 'Complex' },
        probabilities: { '0': 0.5114, '1': 0.4004, '2': 0.0882 },
        confidence: 0.1444,
      },
    },
    usage: { input_tokens: 410, output_tokens: 0 },
  },
  success: true,
  errors: [],
  messages: [],
};

const noulResponse = {
  result: {
    model: 'clef-flash',
    answers: { urgent: { type: 'noul', noul: 0.8411 } },
    usage: { input_tokens: 149, output_tokens: 0 },
  },
  success: true,
  errors: [],
  messages: [],
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(response: Response) {
  const fetchMock = jest.fn().mockResolvedValue(response);
  const model = new WorkersAiDecisionModel({
    baseUrl: BASE_URL,
    apiKey: 'decision-key',
    modelId: MODEL_ID,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { model, fetchMock };
}

function sentBody(fetchMock: jest.Mock): any {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

const urgent = {
  urgent: { type: 'boolean' as const, instructions: 'Is it urgent?', criteria: { true: 'Yes' } },
};

describe('WorkersAiDecisionModel', () => {
  it('declares the model identity', () => {
    const { model } = setup(reply(noulResponse));
    expect(model.provider).toBe('owox-ai');
    expect(model.modelId).toBe(MODEL_ID);
    expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  });

  it('posts model, state and questions to the run endpoint', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    const controller = new AbortController();
    const questions = {
      urgent: { type: 'boolean' as const, instructions: 'Is it urgent?' },
    };

    await model.doDecide({
      state: [{ type: 'json', value: { a: 1 } }],
      questions,
      abortSignal: controller.signal,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/run`);
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer decision-key');
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(init.body)).toEqual({
      model: MODEL_ID,
      input: {
        state: { a: 1 },
        questions: { urgent: { type: 'noul', instructions: 'Is it urgent?' } },
      },
    });
  });

  it('maps boolean to noul and back', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    const result = await model.doDecide({
      state: [{ type: 'text', text: 'ticket' }],
      questions: { urgent: { ...urgent.urgent, criteria: { true: 'Yes', false: 'No' } } },
    });

    expect(sentBody(fetchMock).input.questions.urgent).toEqual({
      type: 'noul',
      instructions: 'Is it urgent?',
      criteria: { true: 'Yes', false: 'No' },
    });
    expect(result.answers).toEqual({ urgent: { type: 'boolean', probability: 0.8411 } });
  });

  it('maps choice and score answers and drops confidence and legend', async () => {
    const { model, fetchMock } = setup(reply(unifiedResponse));
    const result = await model.doDecide({
      state: [{ type: 'text', text: 'x' }],
      questions: {
        component: {
          type: 'choice',
          instructions: 'Which one?',
          criteria: { line_chart: 'Trend', table: null },
        },
        time_axis: { type: 'boolean', instructions: 'Time axis?' },
        complexity: {
          type: 'score',
          instructions: 'How complex?',
          criteria: ['Simple', 'Complex'],
        },
      },
    });

    const sent = sentBody(fetchMock).input.questions;
    expect(sent.component.type).toBe('choice');
    expect(sent.complexity).toEqual({
      type: 'score',
      instructions: 'How complex?',
      criteria: ['Simple', 'Complex'],
    });
    expect(result.answers).toEqual({
      component: {
        type: 'choice',
        choice: 'line_chart',
        probabilities: {
          line_chart: 0.9421,
          bar_chart: 0.0254,
          table: 0.0156,
          kpi_card: 0.0077,
          pie_chart: 0.0092,
        },
      },
      time_axis: { type: 'boolean', probability: 0.9591 },
      complexity: {
        type: 'score',
        score: 0.5768,
        probabilities: { '0': 0.5114, '1': 0.4004, '2': 0.0882 },
      },
    });
  });

  it('passes one JSON object part as the JSON state', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    await model.doDecide({ state: [{ type: 'json', value: { a: 1 } }], questions: urgent });
    expect(sentBody(fetchMock).input.state).toEqual({ a: 1 });
  });

  it('sends an array or scalar JSON part as a text part', async () => {
    for (const [value, text] of [
      [[1, 2], '[1,2]'],
      [5, '5'],
      [null, 'null'],
    ] as const) {
      const { model, fetchMock } = setup(reply(noulResponse));
      await model.doDecide({ state: [{ type: 'json', value }], questions: urgent });
      expect(sentBody(fetchMock).input.state).toEqual([{ type: 'text', text }]);
    }
  });

  it('drops null criteria for a boolean question', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    await model.doDecide({
      state: [{ type: 'text', text: 'x' }],
      questions: { urgent: { type: 'boolean', instructions: 'Urgent?', criteria: null } },
    });
    expect(sentBody(fetchMock).input.questions.urgent).toEqual({
      type: 'noul',
      instructions: 'Urgent?',
    });
  });

  it('sends only type, instructions and criteria', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    await model.doDecide({
      state: [{ type: 'text', text: 'x' }],
      questions: {
        urgent: { type: 'boolean', instructions: 'Urgent?', foo: 1 } as never,
      },
    });
    expect(Object.keys(sentBody(fetchMock).input.questions.urgent).sort()).toEqual([
      'instructions',
      'type',
    ]);
  });

  it('sends object instructions and criteria as JSON text', async () => {
    const { model, fetchMock } = setup(reply(unifiedResponse));
    await model.doDecide({
      state: [{ type: 'text', text: 'x' }],
      questions: {
        component: {
          type: 'choice',
          instructions: { goal: 'pick' },
          criteria: { line_chart: { use: 'trend' }, table: null, kpi_card: 'Single number' },
        },
        complexity: {
          type: 'score',
          instructions: ['rate', 'it'],
          criteria: [{ level: 1 }, 'Complex', null],
        },
      },
    });
    const sent = sentBody(fetchMock).input.questions;
    expect(sent.component).toEqual({
      type: 'choice',
      instructions: '{"goal":"pick"}',
      criteria: { line_chart: '{"use":"trend"}', table: null, kpi_card: 'Single number' },
    });
    expect(sent.complexity).toEqual({
      type: 'score',
      instructions: '["rate","it"]',
      criteria: ['{"level":1}', 'Complex', null],
    });
  });

  it('sends text parts, and JSON parts as serialized text parts', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    await model.doDecide({
      state: [
        { type: 'text', text: 'hello' },
        { type: 'json', value: { a: 1 } },
      ],
      questions: urgent,
    });
    expect(sentBody(fetchMock).input.state).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'text', text: '{"a":1}' },
    ]);
  });

  it('rejects a file part with 400 before the request', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    const call = model.doDecide({
      state: [{ type: 'file', data: { type: 'data', data: 'abc' }, mediaType: 'image/png' }],
      questions: urgent,
    });
    await expect(call).rejects.toThrow(BadRequestException);
    await expect(call).rejects.toThrow(
      'The selected AI model accepts only text and JSON state parts'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a body read error that is not a JSON syntax error', async () => {
    const tooLarge = new BadGatewayException('AI provider response is too large');
    const response = { ok: true, status: 200, json: () => Promise.reject(tooLarge) };
    const { model } = setup(response as unknown as Response);
    await expect(
      model.doDecide({ state: [{ type: 'text', text: 'x' }], questions: urgent })
    ).rejects.toBe(tooLarge);
  });

  it('fails on a successful body that is not JSON', async () => {
    const { model } = setup(new Response('not json', { status: 200 }));
    await expect(
      model.doDecide({ state: [{ type: 'text', text: 'x' }], questions: urgent })
    ).rejects.toThrow('Workers AI returned a body that is not JSON');
  });

  it('answers 413 when the state is larger than the model context', async () => {
    const { model } = setup(
      reply({ errors: [{ message: 'too big', code: 5021 }], success: false, result: {} }, 413)
    );
    const call = model.doDecide({ state: [{ type: 'text', text: 'x' }], questions: urgent });
    await expect(call).rejects.toThrow(PayloadTooLargeException);
    await expect(call).rejects.toThrow('Decision state is too large for the model');
  });

  it('answers 502 for other Cloudflare errors without the token', async () => {
    const { model } = setup(
      reply({ errors: [{ message: 'secret detail', code: 5006 }], success: false, result: {} }, 400)
    );
    const error = await model
      .doDecide({ state: [{ type: 'text', text: 'x' }], questions: urgent })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    const message = (error as Error).message;
    expect(message).toContain('400');
    expect(message).toContain('5006');
    expect(message).not.toContain('decision-key');
    expect(message).not.toContain('secret detail');
  });

  it.each([
    ['no answer', { result: { answers: {}, usage: {} }, success: true }],
    [
      'a mistyped answer',
      { result: { answers: { urgent: { type: 'noul', noul: 'high' } } }, success: true },
    ],
    [
      'an answer of another type',
      { result: { answers: { urgent: { type: 'choice', choice: 'a' } } }, success: true },
    ],
  ])('fails on %s', async (_name, body) => {
    const { model } = setup(reply(body));
    await expect(
      model.doDecide({ state: [{ type: 'text', text: 'x' }], questions: urgent })
    ).rejects.toThrow(InvalidResponseDataError);
  });

  it('declares 4-decimal rounding and maps usage', async () => {
    const { model } = setup(reply(unifiedResponse));
    const result = await model.doDecide({
      state: [{ type: 'text', text: 'x' }],
      questions: {
        component: { type: 'choice', instructions: 'i', criteria: { line_chart: null } },
        time_axis: { type: 'boolean', instructions: 'i' },
        complexity: { type: 'score', instructions: 'i', criteria: ['a', 'b'] },
      },
    });
    expect(result.rounding).toEqual({ probabilityDecimals: 4, scoreDecimals: 4 });
    expect(result.usage).toEqual({ inputTokens: 410, outputTokens: 0 });
    expect(result.warnings).toEqual([]);
  });
});
