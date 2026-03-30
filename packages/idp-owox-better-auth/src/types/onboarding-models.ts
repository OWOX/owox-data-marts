export interface OnboardingAnswer {
  id: string;
  userId: string;
  projectId: string;
  biUserId: string;
  questionId: string;
  answerValue: string;
  otherText?: string | null;
  userRole: string;
  createdAt?: string;
}

export interface SaveOnboardingAnswerItem {
  questionId: string;
  answerValue: string | string[];
  otherText?: string;
}

export interface SaveOnboardingAnswersRequest {
  answers: SaveOnboardingAnswerItem[];
  redirect?: string;
}

/**
 * Represents the onboarding status for a specific user-project pair.
 * Allows tracking onboarding state independently across multiple projects.
 */
export interface UserProjectOnboarding {
  biUserId: string;
  projectId: string;
  onboardingStatus: 'PENDING' | 'DONE' | 'NOT_REQUIRE';
  createdAt?: string;
  updatedAt?: string;
}
