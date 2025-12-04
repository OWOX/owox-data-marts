import { FinalReason } from '../agent/types';
import { PromptAnswer } from '../data-mart-insights.types';

export function mapFinalReasonToPromptAnswer(reason: FinalReason): PromptAnswer {
  switch (reason) {
    case FinalReason.ANSWER:
      return PromptAnswer.OK;
    case FinalReason.NO_DATA:
      return PromptAnswer.NO_DATA;
    case FinalReason.NOT_RELEVANT:
      return PromptAnswer.NOT_RELEVANT;
    case FinalReason.CANNOT_ANSWER:
      return PromptAnswer.CANNOT_ANSWER;
    case FinalReason.HIGH_AMBIGUITY:
      return PromptAnswer.HIGH_AMBIGUITY;
  }
}
