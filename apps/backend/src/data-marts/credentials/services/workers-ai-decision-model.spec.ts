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

  it('passes one JSON part as the JSON state', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    await model.doDecide({ state: [{ type: 'json', value: [1, 2] }], questions: urgent });
    expect(sentBody(fetchMock).input.state).toEqual([1, 2]);
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

  it('rejects a question without instructions with 400 before the request', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    const call = model.doDecide({
      state: [{ type: 'text', text: 'x' }],
      questions: { urgent: { type: 'boolean', criteria: { true: 'Yes' } } },
    });
    await expect(call).rejects.toThrow(BadRequestException);
    await expect(call).rejects.toThrow('OWOX AI decision questions need instructions');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a file part with 400 before the request', async () => {
    const { model, fetchMock } = setup(reply(noulResponse));
    const call = model.doDecide({
      state: [{ type: 'file', data: { type: 'data', data: 'abc' }, mediaType: 'image/png' }],
      questions: urgent,
    });
    await expect(call).rejects.toThrow(BadRequestException);
    await expect(call).rejects.toThrow('OWOX AI decision state accepts text and JSON only');
    expect(fetchMock).not.toHaveBeenCalled();
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
