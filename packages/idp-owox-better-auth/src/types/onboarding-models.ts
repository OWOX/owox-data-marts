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
}
