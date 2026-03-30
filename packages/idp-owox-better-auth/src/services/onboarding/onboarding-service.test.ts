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
    getUserProjectOnboardingStatus: jest.fn(),
    setUserProjectOnboardingStatus: jest.fn(),
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
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue('PENDING');

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(true);
      expect(store.getUserProjectOnboardingStatus).toHaveBeenCalledWith('user-1', 'project-1');
    });

    it('returns false if onboardingStatus is DONE', async () => {
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue('DONE');

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(false);
    });

    it('returns false if onboardingStatus is NOT_REQUIRE', async () => {
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue('NOT_REQUIRE');

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(false);
    });

    it('returns false if status is null (not yet evaluated)', async () => {
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);

      const result = await service.shouldShowQuestionnaire('user-1', 'project-1');

      expect(result).toBe(false);
    });
  });

  describe('evaluateAndSetOnboardingStatus', () => {
    it('sets PENDING if user is eligible (recent, sole admin) and status is null', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);
      jest.mocked(projectMembersService.getMembers).mockResolvedValue([makeAdmin('user-1')]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'PENDING'
      );
      expect(projectMembersService.getMembers).toHaveBeenCalledWith('project-1', {
        forceFresh: false,
      });
    });

    it('sets NOT_REQUIRE if user is not eligible and status is null', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: oldDate(), // Not recent
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'NOT_REQUIRE'
      );
    });

    it('does nothing if status is already DONE', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue('DONE');

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does nothing if status is already PENDING', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue('PENDING');

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does nothing if status is already NOT_REQUIRE', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue('NOT_REQUIRE');

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does not set PENDING if user was created more than 1 day ago (sets NOT_REQUIRE)', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: oldDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'NOT_REQUIRE'
      );
    });

    it('does not set PENDING if project has multiple admins (sets NOT_REQUIRE)', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);
      jest
        .mocked(projectMembersService.getMembers)
        .mockResolvedValue([makeAdmin('user-1'), makeAdmin('user-2')]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'NOT_REQUIRE'
      );
    });

    it('does not set PENDING if user is not the sole admin (sets NOT_REQUIRE)', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);
      jest
        .mocked(projectMembersService.getMembers)
        .mockResolvedValue([makeAdmin('user-other'), makeViewer('user-1')]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'NOT_REQUIRE'
      );
    });

    it('ignores outbound members when checking admins', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);
      const outboundAdmin: ProjectMember = {
        ...makeAdmin('user-2'),
        isOutbound: true,
      };
      jest
        .mocked(projectMembersService.getMembers)
        .mockResolvedValue([makeAdmin('user-1'), outboundAdmin]);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'PENDING'
      );
    });

    it('does not throw if getMembers fails', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        createdAt: recentDate(),
      });
      jest.mocked(store.getUserProjectOnboardingStatus).mockResolvedValue(null);
      jest.mocked(projectMembersService.getMembers).mockRejectedValue(new Error('Network error'));

      await expect(
        service.evaluateAndSetOnboardingStatus('user-1', 'project-1')
      ).resolves.not.toThrow();
      expect(store.setUserProjectOnboardingStatus).not.toHaveBeenCalled();
    });

    it('does nothing if user not found', async () => {
      jest.mocked(store.getUserByBiUserId).mockResolvedValue(null);

      await service.evaluateAndSetOnboardingStatus('user-1', 'project-1');

      expect(store.setUserProjectOnboardingStatus).not.toHaveBeenCalled();
    });
  });

  describe('saveAnswers', () => {
    it('saves valid single-select answer and sets status to DONE', async () => {
      await service.saveAnswers('user-1', 'project-1', 'bi-user-1', 'admin', {
        answers: [{ questionId: 'primary_role', answerValue: 'data_analyst_engineer' }],
      });

      expect(store.saveOnboardingAnswers).toHaveBeenCalledTimes(1);
      const saved = jest.mocked(store.saveOnboardingAnswers).mock.calls[0]![0] as Array<{
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
      expect(store.setUserProjectOnboardingStatus).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'DONE'
      );
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

      const saved = jest.mocked(store.saveOnboardingAnswers).mock.calls[0]![0] as Array<{
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

      const saved = jest.mocked(store.saveOnboardingAnswers).mock.calls[0]![0] as Array<{
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

      const saved = jest.mocked(store.saveOnboardingAnswers).mock.calls[0]![0] as Array<{
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

      const saved = jest.mocked(store.saveOnboardingAnswers).mock.calls[0]![0] as Array<{
        otherText: string | null;
      }>;
      expect(saved[0]!.otherText).toBe('AT&T Company');
    });
  });

  describe('getAnswersForPayload', () => {
    it('returns empty array when no answers exist', async () => {
      jest.mocked(store.hasOnboardingAnswers).mockResolvedValue(false);

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([]);
      expect(store.getOnboardingAnswers).not.toHaveBeenCalled();
    });

    it('returns deserialized answers with JSON arrays', async () => {
      jest.mocked(store.hasOnboardingAnswers).mockResolvedValue(true);
      jest.mocked(store.getOnboardingAnswers).mockResolvedValue([
        {
          id: '1',
          userId: 'user-1',
          projectId: 'project-1',
          biUserId: 'bi-user-1',
          userRole: 'admin',
          questionId: 'use_case',
          answerValue: '["sync_dwh_sheets","ai_insights"]',
        },
        {
          id: '2',
          userId: 'user-1',
          projectId: 'project-1',
          biUserId: 'bi-user-1',
          userRole: 'admin',
          questionId: 'primary_role',
          answerValue: 'data_analyst_engineer',
        },
      ]);

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([
        { questionId: 'use_case', answerValue: ['sync_dwh_sheets', 'ai_insights'] },
        { questionId: 'primary_role', answerValue: 'data_analyst_engineer' },
      ]);
    });

    it('keeps malformed JSON as raw string instead of failing', async () => {
      jest.mocked(store.hasOnboardingAnswers).mockResolvedValue(true);
      jest.mocked(store.getOnboardingAnswers).mockResolvedValue([
        {
          id: '1',
          userId: 'user-1',
          projectId: 'project-1',
          biUserId: 'bi-user-1',
          userRole: 'admin',
          questionId: 'use_case',
          answerValue: '[broken json',
        },
        {
          id: '2',
          userId: 'user-1',
          projectId: 'project-1',
          biUserId: 'bi-user-1',
          userRole: 'admin',
          questionId: 'primary_role',
          answerValue: 'c_level',
        },
      ]);

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([
        { questionId: 'use_case', answerValue: '[broken json' },
        { questionId: 'primary_role', answerValue: 'c_level' },
      ]);
    });

    it('returns empty array on store error', async () => {
      jest.mocked(store.hasOnboardingAnswers).mockRejectedValue(new Error('DB error'));

      const result = await service.getAnswersForPayload('user-1', 'project-1');

      expect(result).toEqual([]);
    });
  });
});
