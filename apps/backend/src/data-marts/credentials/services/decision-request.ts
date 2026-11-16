import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * One decision contract for every route, so a plugin that works with one AI Credential works with
 * all of them and with OWOX AI. The limits are those of the strictest supported provider.
 */
export const MAX_DECISION_QUESTIONS = 64;
export const MAX_DECISION_OPTIONS = 255;
export const MAX_DECISION_SCORE_LEVELS = 10;

/** A non-blank string, or a non-empty object or list. */
const Content = z.union([
  z.string().refine(value => value.trim() !== ''),
  z.array(z.unknown()).min(1),
  z.record(z.string(), z.unknown()).refine(value => Object.keys(value).length > 0),
]);

// The provider adapters read these fields without a check.
const FileData = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('data'), data: z.union([z.string(), z.instanceof(Uint8Array)]) }),
  z.looseObject({ type: z.literal('url'), url: z.instanceof(URL) }),
  z.looseObject({ type: z.literal('text'), text: z.string() }),
  z.looseObject({ type: z.literal('reference'), reference: z.record(z.string(), z.unknown()) }),
]);

const StatePart = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('text'), text: z.string() }),
  z.looseObject({ type: z.literal('json'), value: z.unknown() }).refine(part => 'value' in part),
  z.looseObject({ type: z.literal('file'), mediaType: z.string(), data: FileData }),
]);

const DecisionRequest = z.looseObject({
  state: z.array(StatePart),
  questions: z.record(z.string(), z.unknown()),
});

const QuestionType = z.looseObject({ type: z.string() });

// `__proto__` and the other Object.prototype names do not survive as keys of a plain object.
const QuestionId = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,100}$/)
  .refine(id => !(id in Object.prototype));

const QUESTIONS = {
  choice: {
    schema: z.looseObject({
      instructions: Content,
      criteria: z
        .record(z.string().min(1), z.unknown())
        .refine(criteria => Object.keys(criteria).length >= 2)
        .refine(criteria => Object.keys(criteria).length <= MAX_DECISION_OPTIONS),
    }),
    criteriaRule: `needs 2 to ${MAX_DECISION_OPTIONS} named options`,
  },
  score: {
    schema: z.looseObject({
      instructions: Content,
      criteria: z.array(Content).min(2).max(MAX_DECISION_SCORE_LEVELS),
    }),
    criteriaRule: `needs 2 to ${MAX_DECISION_SCORE_LEVELS} non-empty score levels`,
  },
  boolean: {
    schema: z.looseObject({
      instructions: Content,
      criteria: z.record(z.string(), z.unknown()).nullish(),
    }),
    criteriaRule: 'has invalid criteria',
  },
} as const;

/** Refuses a decision request that a provider would refuse, with 400 before the provider call. */
export function assertDecisionRequest(
  options: unknown,
  supportedQuestionTypes: readonly string[]
): void {
  const request = DecisionRequest.safeParse(options);
  if (!request.success) {
    throw new BadRequestException(
      request.error.issues[0]?.path[0] === 'state'
        ? 'Decision state must be a list of text, json, or file parts'
        : 'Decision questions must be an object'
    );
  }
  // The input, not the parsed copy: a parsed record loses a `__proto__` key.
  const questions = Object.entries((options as { questions: Record<string, unknown> }).questions);
  if (questions.length < 1 || questions.length > MAX_DECISION_QUESTIONS) {
    throw new BadRequestException(
      `Decision questions must be an object with 1 to ${MAX_DECISION_QUESTIONS} questions`
    );
  }
  for (const [id, question] of questions) {
    if (!QuestionId.safeParse(id).success) {
      throw new BadRequestException(
        'A decision question ID must have 1 to 100 letters, digits, "_", "." or "-", and must ' +
          'not be an Object property name such as "__proto__"'
      );
    }
    const typed = QuestionType.safeParse(question);
    if (!typed.success) throw new BadRequestException(`Decision question ${id} is invalid`);
    const { type } = typed.data;
    const rules = QUESTIONS[type as keyof typeof QUESTIONS];
    if (!supportedQuestionTypes.includes(type) || !rules) {
      throw unsupportedQuestionType(id, type);
    }
    const parsed = rules.schema.safeParse(question);
    if (!parsed.success) {
      const rule =
        parsed.error.issues[0]?.path[0] === 'instructions'
          ? 'needs instructions'
          : rules.criteriaRule;
      throw new BadRequestException(`Decision question ${id} ${rule}`);
    }
  }
}

export function unsupportedQuestionType(id: string, type: string): BadRequestException {
  return new BadRequestException(
    `Decision question ${id} has the type ${type}, which this AI model does not support`
  );
}
