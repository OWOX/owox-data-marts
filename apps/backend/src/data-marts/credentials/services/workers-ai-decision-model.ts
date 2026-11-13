import { BadGatewayException, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  InvalidResponseDataError,
  type Experimental_DecisionModelV4,
  type Experimental_DecisionModelV4CallOptions,
  type Experimental_DecisionModelV4Question,
  type Experimental_DecisionModelV4Result,
} from '@ai-sdk/provider';

/** Workers AI error code for a state larger than the model context. */
const CONTEXT_TOO_LARGE_CODE = 5021;

type WorkersAiAnswer = { type?: unknown; [key: string]: unknown };

/**
 * Decision model over the Workers AI REST API.
 * The AI SDK has no Cloudflare decision provider, so this class does the mapping.
 */
export class WorkersAiDecisionModel implements Experimental_DecisionModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'owox-ai';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;
  readonly modelId: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: { baseUrl: string; apiKey: string; modelId: string; fetch: typeof fetch }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.modelId = config.modelId;
    this.fetchFn = config.fetch;
  }

  async doDecide(
    options: Experimental_DecisionModelV4CallOptions
  ): Promise<Experimental_DecisionModelV4Result> {
    const questions: Record<string, unknown> = {};
    for (const [id, question] of Object.entries(options.questions)) {
      questions[id] = this.mapQuestion(question);
    }
    const state = this.mapState(options.state);

    const response = await this.fetchFn(`${this.baseUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.modelId, input: { state, questions } }),
      signal: options.abortSignal,
    });

    const body = await this.readBody(response);
    if (!response.ok || body?.success === false) {
      this.throwHttpError(response.status, body);
    }

    const result = body?.result as
      | { answers?: Record<string, WorkersAiAnswer>; usage?: Record<string, unknown> }
      | undefined;
    const answers: Experimental_DecisionModelV4Result['answers'] = {};
    for (const [id, question] of Object.entries(options.questions)) {
      answers[id] = this.mapAnswer(id, question.type, result?.answers?.[id], body);
    }

    return {
      answers,
      rounding: { probabilityDecimals: 4, scoreDecimals: 4 },
      usage: {
        inputTokens: numberOrUndefined(result?.usage?.input_tokens),
        outputTokens: numberOrUndefined(result?.usage?.output_tokens),
      },
      warnings: [],
    };
  }

  private mapQuestion(question: Experimental_DecisionModelV4Question): unknown {
    if (question.type === 'box') {
      throw new BadRequestException('OWOX AI decision does not support box questions');
    }
    const instructions = toText(question.instructions);
    if (
      instructions === null ||
      instructions.trim() === '' ||
      instructions === '{}' ||
      instructions === '[]'
    ) {
      throw new BadRequestException('OWOX AI decision questions need instructions');
    }
    // Send only the fields that Workers AI accepts; it rejects null criteria.
    const criteria = 'criteria' in question ? question.criteria : undefined;
    return {
      type: question.type === 'boolean' ? 'noul' : question.type,
      instructions,
      ...(criteria === null || criteria === undefined ? {} : { criteria: mapCriteria(criteria) }),
    };
  }

  private mapState(state: Experimental_DecisionModelV4CallOptions['state']): unknown {
    if (state.some(part => part.type === 'file')) {
      throw new BadRequestException('OWOX AI decision state accepts text and JSON only');
    }
    const [only] = state;
    // Workers AI reads a top-level array as text parts, so only a plain object goes through raw.
    if (
      state.length === 1 &&
      only.type === 'json' &&
      typeof only.value === 'object' &&
      only.value !== null &&
      !Array.isArray(only.value)
    ) {
      return only.value;
    }
    return state.map(part =>
      part.type === 'json'
        ? { type: 'text', text: JSON.stringify(part.value) }
        : { type: 'text', text: (part as { text: string }).text }
    );
  }

  private mapAnswer(
    id: string,
    type: Experimental_DecisionModelV4Question['type'],
    answer: WorkersAiAnswer | undefined,
    data: unknown
  ): Experimental_DecisionModelV4Result['answers'][string] {
    const fail = (): never => {
      throw new InvalidResponseDataError({
        data,
        message: `Workers AI returned no valid answer for question "${id}"`,
      });
    };
    if (!answer || typeof answer !== 'object') return fail();

    if (type === 'boolean') {
      return answer.type === 'noul' && typeof answer.noul === 'number'
        ? { type: 'boolean', probability: answer.noul }
        : fail();
    }
    if (type === 'choice') {
      return answer.type === 'choice' && typeof answer.choice === 'string'
        ? { type: 'choice', choice: answer.choice, probabilities: probabilitiesOf(answer) }
        : fail();
    }
    if (type === 'score') {
      return answer.type === 'score' && typeof answer.score === 'number'
        ? { type: 'score', score: answer.score, probabilities: probabilitiesOf(answer) }
        : fail();
    }
    return fail();
  }

  private async readBody(response: Response): Promise<Record<string, unknown> | undefined> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      if (response.ok) {
        throw new InvalidResponseDataError({
          data: undefined,
          message: 'Workers AI returned a body that is not JSON',
        });
      }
      return undefined;
    }
  }

  // The message holds only the status and the numeric codes: never the token or Cloudflare text.
  private throwHttpError(status: number, body: Record<string, unknown> | undefined): never {
    const errors = Array.isArray(body?.errors) ? (body.errors as { code?: unknown }[]) : [];
    const codes = errors.map(error => error?.code).filter(code => typeof code === 'number');
    if (status === 413 || codes.includes(CONTEXT_TOO_LARGE_CODE)) {
      throw new PayloadTooLargeException('Decision state is too large for the model');
    }
    throw new BadGatewayException(
      `Workers AI answered HTTP ${status}${codes.length ? ` (codes ${codes.join(', ')})` : ''}`
    );
  }
}

function probabilitiesOf(answer: WorkersAiAnswer): Record<string, number> | undefined {
  const value = answer.probabilities;
  return value && typeof value === 'object' ? (value as Record<string, number>) : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** Clef reads text only. A string stays as is; any other value goes as JSON text. */
function toText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function mapCriteria(criteria: object): unknown {
  return Array.isArray(criteria)
    ? criteria.map(toText)
    : Object.fromEntries(Object.entries(criteria).map(([key, value]) => [key, toText(value)]));
}
