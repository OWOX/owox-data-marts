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
      answers[id] = this.mapAnswer(id, question, result?.answers?.[id], body);
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

  // CredentialAiService.decideWith has checked the question type and the instructions.
  private mapQuestion(question: Experimental_DecisionModelV4Question): unknown {
    // Send only the fields that Workers AI accepts; it rejects null criteria.
    const criteria = 'criteria' in question ? question.criteria : undefined;
    return {
      type: question.type === 'boolean' ? 'noul' : question.type,
      instructions: toText(question.instructions),
      ...(criteria === null || criteria === undefined ? {} : { criteria: mapCriteria(criteria) }),
    };
  }

  private mapState(state: Experimental_DecisionModelV4CallOptions['state']): unknown {
    if (state.some(part => part.type === 'file')) {
      throw new BadRequestException('The selected AI model accepts only text and JSON state parts');
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

  // A wrong answer fails here, before OWOX AI records the call as an AI Process Run.
  private mapAnswer(
    id: string,
    question: Experimental_DecisionModelV4Question,
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

    if (question.type === 'boolean') {
      return answer.type === 'noul' && isProbability(answer.noul)
        ? { type: 'boolean', probability: answer.noul }
        : fail();
    }
    if (question.type === 'choice') {
      const options = Object.keys(question.criteria);
      const probabilities = probabilitiesOf(answer, options);
      return answer.type === 'choice' &&
        typeof answer.choice === 'string' &&
        options.includes(answer.choice) &&
        probabilities !== null
        ? { type: 'choice', choice: answer.choice, probabilities }
        : fail();
    }
    if (question.type === 'score') {
      const levels = question.criteria.map((_level, index) => String(index));
      const probabilities = probabilitiesOf(answer, levels);
      return answer.type === 'score' &&
        typeof answer.score === 'number' &&
        answer.score >= 0 &&
        answer.score <= levels.length - 1 &&
        probabilities !== null
        ? { type: 'score', score: answer.score, probabilities }
        : fail();
    }
    return fail();
  }

  private async readBody(response: Response): Promise<Record<string, unknown> | undefined> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      // A size cap, a timeout, or an abort from the fetch wrapper keeps its own error.
      // By name: the fetch implementation can throw a SyntaxError from another realm.
      if ((error as { name?: unknown } | null)?.name !== 'SyntaxError') throw error;
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

/** Undefined when absent; null when it names an unknown key or holds a value outside [0, 1]. */
function probabilitiesOf(
  answer: WorkersAiAnswer,
  keys: readonly string[]
): Record<string, number> | undefined | null {
  const value = answer.probabilities;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([key, probability]) => keys.includes(key) && isProbability(probability))
    ? (value as Record<string, number>)
    : null;
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
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
