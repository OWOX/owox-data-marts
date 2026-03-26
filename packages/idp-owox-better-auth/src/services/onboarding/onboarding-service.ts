import {
  ONBOARDING_QUESTION,
  VALID_PRIMARY_ROLE_VALUES,
  VALID_PRIMARY_STORAGE_VALUES,
  VALID_USE_CASE_VALUES,
  USER_AGE_THRESHOLD_MS,
  type OnboardingQuestionId,
} from '../../core/onboarding-constants.js';
import type { OnboardingAnswer, SaveOnboardingAnswersRequest } from '../../types/index.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { ProjectMembersService } from '../core/project-members-service.js';
import { createServiceLogger } from '../../core/logger.js';

const QUESTION_IDS = new Set<string>(Object.values(ONBOARDING_QUESTION));

const ANSWER_VALIDATORS: Record<string, Set<string>> = {
  [ONBOARDING_QUESTION.USE_CASE]: VALID_USE_CASE_VALUES as Set<string>,
  [ONBOARDING_QUESTION.PRIMARY_ROLE]: VALID_PRIMARY_ROLE_VALUES as Set<string>,
  [ONBOARDING_QUESTION.PRIMARY_STORAGE]: VALID_PRIMARY_STORAGE_VALUES as Set<string>,
};

const OTHER_TEXT_MAX_LENGTH = 500;
const ORG_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

export class OnboardingService {
  private readonly logger = createServiceLogger(OnboardingService.name);

  constructor(
    private readonly store: DatabaseStore,
    private readonly projectMembersService: ProjectMembersService
  ) {}

  /**
   * Returns true if the onboarding questionnaire should be shown to the user.
   *
   * Conditions (all must be true):
   * 1. User has NOT already answered for this project
   * 2. Project has exactly 1 member with ADMIN role and it is the current user
   * 3. User was created in Better Auth within the last 1 day
   */
  async shouldShowQuestionnaire(userId: string, projectId: string): Promise<boolean> {
    const hasAnswers = await this.store.hasOnboardingAnswers(userId, projectId);
    if (hasAnswers) return false;

    // Check if user was created recently (within 1 day)
    const user = await this.store.getUserByBiUserId(userId);
    if (!user?.createdAt) return false;

    const createdAt = new Date(user.createdAt).getTime();
    const now = Date.now();
    if (now - createdAt > USER_AGE_THRESHOLD_MS) return false;

    // Check project members: exactly 1 admin and it must be this user
    try {
      const members = await this.projectMembersService.getMembers(projectId, { forceFresh: false });
      if (!members) return false;

      const activeMembers = members.filter(m => !m.isOutbound);
      const admins = activeMembers.filter(m => m.projectRole === 'admin');

      if (admins.length !== 1) return false;
      if (admins[0]!.userId !== userId) return false;

      return true;
    } catch (error) {
      this.logger.warn(
        'Failed to check project members for onboarding',
        undefined,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Saves validated and sanitized onboarding answers.
   */
  async saveAnswers(
    userId: string,
    projectId: string,
    biUserId: string,
    userRole: string,
    request: SaveOnboardingAnswersRequest
  ): Promise<void> {
    const answers: OnboardingAnswer[] = [];

    for (const item of request.answers) {
      this.validateQuestionId(item.questionId);

      const answerValue = this.validateAndSerializeAnswer(
        item.questionId as OnboardingQuestionId,
        item.answerValue
      );

      const sanitizedOtherText = item.otherText ? this.sanitizeText(item.otherText) : null;

      answers.push({
        id: crypto.randomUUID(),
        userId,
        projectId,
        biUserId,
        questionId: item.questionId,
        answerValue,
        otherText: sanitizedOtherText,
        userRole,
      });
    }

    await this.store.saveOnboardingAnswers(answers);
  }

  /**
   * Fetches onboarding answers for a user/project and deserializes JSON arrays.
   * Uses hasOnboardingAnswers as a cheap check first to avoid unnecessary SELECT.
   * Returns an empty array if no answers exist or on any error.
   */
  async getAnswersForPayload(
    userId: string,
    projectId: string
  ): Promise<{ questionId: string; answerValue: string | string[] }[]> {
    try {
      const hasAnswers = await this.store.hasOnboardingAnswers(userId, projectId);
      if (!hasAnswers) return [];

      const answers = await this.store.getOnboardingAnswers(userId, projectId);
      return answers.map(a => {
        let parsed: string | string[] = a.answerValue;
        if (a.answerValue.startsWith('[')) {
          try {
            parsed = JSON.parse(a.answerValue) as string[];
          } catch {
            // keep as raw string if JSON is malformed
          }
        }
        return { questionId: a.questionId, answerValue: parsed };
      });
    } catch (error) {
      this.logger.warn(
        'Failed to get onboarding answers for payload',
        undefined,
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  private validateQuestionId(questionId: string): void {
    if (!QUESTION_IDS.has(questionId)) {
      throw new Error('Invalid question identifier');
    }
  }

  private validateAndSerializeAnswer(
    questionId: OnboardingQuestionId,
    answerValue: string | string[]
  ): string {
    if (questionId === ONBOARDING_QUESTION.ORG_DOMAIN) {
      const domain = String(answerValue).trim();
      if (domain && !ORG_DOMAIN_PATTERN.test(domain)) {
        throw new Error('Invalid organization domain format');
      }
      return this.sanitizeText(domain);
    }

    const validSet = ANSWER_VALIDATORS[questionId];
    if (!validSet) {
      throw new Error('Invalid question identifier');
    }

    if (Array.isArray(answerValue)) {
      for (const val of answerValue) {
        if (!validSet.has(val)) {
          throw new Error('Invalid answer value for question');
        }
      }
      return JSON.stringify(answerValue);
    }

    if (!validSet.has(answerValue)) {
      throw new Error('Invalid answer value for question');
    }
    return answerValue;
  }

  /**
   * Sanitizes free-text input:
   * - Trims and limits length
   * - Iteratively strips HTML tags (handles nested patterns)
   * HTML entity escaping is NOT done at storage time — it should be done at render time.
   */
  private sanitizeText(text: string): string {
    let sanitized = text.trim().slice(0, OTHER_TEXT_MAX_LENGTH);
    let prev = '';
    while (prev !== sanitized) {
      prev = sanitized;
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    return sanitized;
  }
}
