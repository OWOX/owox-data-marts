import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProjectMember } from '@owox/idp-protocol';
import type { DatabaseStore } from '../../store/database-store.js';
import type { ProjectMembersService } from '../core/project-members-service.js';
import { OnboardingService } from './onboarding-service.js';

function createStoreMock(): jest.Mocked<DatabaseStore> {
  return {
    initialize: jest.fn(),
    isHealthy: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    shutdown: jest.fn(),
    getAdapter: jest.fn(),
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
    getAccountByUserId: jest.fn(),
    getAccountsByUserId: jest.fn(),
    getAccountByUserIdAndProvider: jest.fn(),
    updateUserLastLoginMethod: jest.fn(),
    updateUserFirstLoginMethod: jest.fn(),
    updateUserBiUserId: jest.fn(),
    getUserByBiUserId: jest.fn(),
    findActiveMagicLink: jest.fn(),
    saveAuthState: jest.fn(),
    getAuthState: jest.fn(),
    deleteAuthState: jest.fn(),
    purgeExpiredAuthStates: jest.fn(),
    saveProjectMembers: jest.fn(),
    getProjectMembers: jest.fn(),
    getProjectSyncInfo: jest.fn(),
    updateUserOnboardingStatus: jest.fn(),
    saveOnboardingAnswers: jest.fn(),
    hasOnboardingAnswers: jest.fn(),
    getOnboardingAnswers: jest.fn(),
  } as unknown as jest.Mocked<DatabaseStore>;
}

function createProjectMembersServiceMock(): jest.Mocked<ProjectMembersService> {
  return {
    getMembers: jest.fn(),
  } as unknown as jest.Mocked<ProjectMembersService>;
}

function recentDate(): string {
  return new Date(Date.now() - 1000 * 60 * 30).toISOString(); // 30 min ago
}

function oldDate(): string {
  return new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25 hours ago
}

function makeAdmin(userId: string): ProjectMember {
  return {
    userId,
    email: 'admin@test.com',
    projectRole: 'admin',
    userStatus: 'active',
    hasNotificationsEnabled: true,
    isOutbound: false,
  };
}

function makeViewer(userId: string): ProjectMember {
  return {
    userId,
    email: 'viewer@test.com',
    projectRole: 'viewer',
    userStatus: 'active',
    hasNotificationsEnabled: true,
    isOutbound: false,
  };
}

describe('OnboardingService', () => {
  let store: jest.Mocked<DatabaseStore>;
  let projectMembersService: jest.Mocked<ProjectMembersService>;
  let service: OnboardingService;

  beforeEach(() => {
    store = createStoreMock();
    projectMembersService = createProjectMembersServiceMock();
    service = new OnboardingService(store, projectMembersService);
  });

  describe('shouldShowQuestionnaire', () => {
    it('returns true if onboardingStatus is PENDING', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'PENDING',
      });

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(true);
    });

    it('returns false if onboardingStatus is DONE', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'DONE',
      });

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(false);
    });

    it('returns false if onboardingStatus is NOT_REQUIRE', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
      });

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(false);
    });

    it('returns false if user not found', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue(null);

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(false);
    });
  });

  describe('evaluateAndSetOnboardingStatus', () => {
    it('sets PENDING if user is eligible (recent, sole admin)', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
        createdAt: recentDate(),
      });
      (projectMembersService.getMembers as jest.Mock).mockResolvedValue([makeAdmin('user-1')]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).toHaveBeenCalledWith('user-1', 'PENDING');
      expect(projectMembersService.getMembers).toHaveBeenCalledWith('project-1', {
        forceFresh: false,
      });
    });

    it('does nothing if status is already DONE', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'DONE',
        createdAt: recentDate(),
      });

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does nothing if status is already PENDING', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'PENDING',
        createdAt: recentDate(),
      });

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does not set PENDING if user was created more than 1 day ago', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
        createdAt: oldDate(),
      });

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does not set PENDING if project has multiple admins', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
        createdAt: recentDate(),
      });
      (projectMembersService.getMembers as jest.Mock).mockResolvedValue([
        makeAdmin('user-1'),
        makeAdmin('user-2'),
      ]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does not set PENDING if user is not the sole admin', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
        createdAt: recentDate(),
      });
      (projectMembersService.getMembers as jest.Mock).mockResolvedValue([
        makeAdmin('user-other'),
        makeViewer('user-1'),
      ]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).not.toHaveBeenCalled();
    });

    it('ignores outbound members when checking admins', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
        createdAt: recentDate(),
      });
      const outboundAdmin: ProjectMember = {
        ...makeAdmin('user-2'),
        isOutbound: true,
      };
      (projectMembersService.getMembers as jest.Mock).mockResolvedValue([
        makeAdmin('user-1'),
        outboundAdmin,
      ]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.updateUserOnboardingStatus).toHaveBeenCalledWith('user-1', 'PENDING');
    });

    it('does not throw if getMembers fails', async () => {
      (store.getUserByBiUserId as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        onboardingStatus: 'NOT_REQUIRE',
        createdAt: recentDate(),
      });
      (projectMembersService.getMembers as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        service.evaluateAndSetOnboardingStatus('user-1', 'project-1')
      ).resolves.not.toThrow();
      expect(store.updateUserOnboardingStatus).not.toHaveBeenCalled();
    });
  });

  describe('saveAnswers', () => {
    it('saves valid single-select answer and sets status to DONE', async () => {
      await service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'admin', {
        answers: [{ questionId: 'primary_role', answerValue: 'data_analyst_engineer' }],
      });

      expect(store.saveOnboardingAnswers).toHaveBeenCalledTimes(1);
      const saved = (store.saveOnboardingAnswers as jest.Mock).mock.calls[0]![0] as Array<{
        questionId: string;
        answerValue: string;
        userRole: string;
        projectId: string;
        biUserId: string;
      }>;
      expect(saved).toHaveLength(1);
      expect(saved[0]!.questionId).toBe('primary_role');
      expect(saved[0]!.answerValue).toBe('data_analyst_engineer');
      expect(saved[0]!.userRole).toBe('admin');
      expect(saved[0]!.projectId).toBe('project-1');
      expect(saved[0]!.biUserId).toBe('bi-user-1');
      expect(store.updateUserOnboardingStatus).toHaveBeenCalledWith('user-1', 'DONE');
    });

    it('saves valid multi-select answer as JSON array', async () => {
      await service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'viewer', {
        answers: [
          {
            questionId: 'use_case',
            answerValue: ['sync_dwh_sheets', 'ai_insights'],
          },
        ],
      });

      const saved = (store.saveOnboardingAnswers as jest.Mock).mock.calls[0]![0] as Array<{
        answerValue: string;
      }>;
      expect(JSON.parse(saved[0]!.answerValue)).toEqual(['sync_dwh_sheets', 'ai_insights']);
    });

    it('sanitizes otherText by stripping HTML and limiting length', async () => {
      const longText = 'a'.repeat(600);
      await service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'viewer', {
        answers: [
          {
            questionId: 'primary_role',
            answerValue: 'other',
            otherText: `<script>alert("xss")</script>${longText}`,
          },
        ],
      });

      const saved = (store.saveOnboardingAnswers as jest.Mock).mock.calls[0]![0] as Array<{
        otherText: string | null;
      }>;
      expect(saved[0]!.otherText).not.toContain('<script>');
      expect(saved[0]!.otherText!.length).toBeLessThanOrEqual(500);
    });

    it('throws on invalid questionId', async () => {
      await expect(
        service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'viewer', {
          answers: [{ questionId: 'invalid_question', answerValue: 'something' }],
        })
      ).rejects.toThrow('Invalid question identifier');
    });

    it('throws on invalid answerValue', async () => {
      await expect(
        service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'viewer', {
          answers: [{ questionId: 'primary_role', answerValue: 'not_a_valid_role' }],
        })
      ).rejects.toThrow('Invalid answer value for question');
    });

    it('saves org_domain as sanitized text', async () => {
      await service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'admin', {
        answers: [{ questionId: 'org_domain', answerValue: 'example.com' }],
      });

      const saved = (store.saveOnboardingAnswers as jest.Mock).mock.calls[0]![0] as Array<{
        answerValue: string;
      }>;
      expect(saved[0]!.answerValue).toBe('example.com');
    });

    it('throws on invalid org_domain format', async () => {
      await expect(
        service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'viewer', {
          answers: [{ questionId: 'org_domain', answerValue: 'not a domain <script>' }],
        })
      ).rejects.toThrow('Invalid organization domain format');
    });

    it('does not double-encode ampersands in otherText', async () => {
      await service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'viewer', {
        answers: [
          {
            questionId: 'primary_role',
            answerValue: 'other',
            otherText: 'AT&T Company',
          },
        ],
      });

      const saved = (store.saveOnboardingAnswers as jest.Mock).mock.calls[0]![0] as Array<{
        otherText: string | null;
      }>;
      expect(saved[0]!.otherText).toBe('AT&T Company');
    });
  });

  describe('getAnswersForPayload', () => {
    it('returns empty array when no answers exist', async () => {
      (store.hasOnboardingAnswers as jest.Mock).mockResolvedValue(false);

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([]);
      expect(store.getOnboardingAnswers).not.toHaveBeenCalled();
    });

    it('returns deserialized answers with JSON arrays', async () => {
      (store.hasOnboardingAnswers as jest.Mock).mockResolvedValue(true);
      (store.getOnboardingAnswers as jest.Mock).mockResolvedValue([
        { questionId: 'use_case', answerValue: '["sync_dwh_sheets","ai_insights"]' },
        { questionId: 'primary_role', answerValue: 'data_analyst_engineer' },
      ]);

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([
        { questionId: 'use_case', answerValue: ['sync_dwh_sheets', 'ai_insights'] },
        { questionId: 'primary_role', answerValue: 'data_analyst_engineer' },
      ]);
    });

    it('keeps malformed JSON as raw string instead of failing', async () => {
      (store.hasOnboardingAnswers as jest.Mock).mockResolvedValue(true);
      (store.getOnboardingAnswers as jest.Mock).mockResolvedValue([
        { questionId: 'use_case', answerValue: '[broken json' },
        { questionId: 'primary_role', answerValue: 'c_level' },
      ]);

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([
        { questionId: 'use_case', answerValue: '[broken json' },
        { questionId: 'primary_role', answerValue: 'c_level' },
      ]);
    });

    it('returns empty array on store error', async () => {
      (store.hasOnboardingAnswers as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([]);
    });
  });
});
