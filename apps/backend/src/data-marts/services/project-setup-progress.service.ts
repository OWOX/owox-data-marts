import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSetupProgress } from '../entities/project-setup-progress.entity';
import { ProjectSetupUserProgress } from '../entities/project-setup-user-progress.entity';
import {
  ProjectSetupSteps,
  StepState,
  SetupStepKey,
  SETUP_STEP_KEYS,
  USER_SCOPED_STEP_KEYS,
  createEmptySteps,
} from '../dto/domain/project-setup-steps.interface';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

const REPORT_RUN_TYPES = [
  DataMartRunType.GOOGLE_SHEETS_EXPORT,
  DataMartRunType.LOOKER_STUDIO,
  DataMartRunType.EMAIL,
  DataMartRunType.SLACK,
  DataMartRunType.MS_TEAMS,
  DataMartRunType.GOOGLE_CHAT,
];

@Injectable()
export class ProjectSetupProgressService {
  constructor(
    @InjectRepository(ProjectSetupProgress)
    private readonly progressRepository: Repository<ProjectSetupProgress>,
    @InjectRepository(ProjectSetupUserProgress)
    private readonly userProgressRepository: Repository<ProjectSetupUserProgress>,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  /**
   * Returns merged progress: project-scoped steps + user-scoped steps.
   * Also checks hasTeammatesInvited via IDP on each call (lazy update).
   */
  async getFullProgress(
    projectId: string,
    userId: string
  ): Promise<{ projectProgress: ProjectSetupProgress; mergedSteps: ProjectSetupSteps }> {
    const [projectProgress, userProgress] = await Promise.all([
      this.getOrInitializeProject(projectId),
      this.getOrInitializeUser(projectId, userId),
    ]);

    // Lazy check: if hasTeammatesInvited is not yet done, check IDP for >1 members
    if (!projectProgress.steps.hasTeammatesInvited.done) {
      const hasTeammates = await this.checkTeammatesInvited(projectId);
      if (hasTeammates) {
        projectProgress.steps.hasTeammatesInvited = {
          done: true,
          completedAt: new Date().toISOString(),
        };
        await this.progressRepository.save(projectProgress);
      }
    }

    const mergedSteps = { ...projectProgress.steps };

    for (const key of USER_SCOPED_STEP_KEYS) {
      if (userProgress.steps[key]) {
        mergedSteps[key] = userProgress.steps[key];
      }
    }

    return { projectProgress, mergedSteps };
  }

  /**
   * Marks a project-scoped step as done. Idempotent — no-op if already done.
   */
  async markProjectStepDone(projectId: string, stepKey: SetupStepKey): Promise<void> {
    if (!SETUP_STEP_KEYS.includes(stepKey)) return;

    const progress = await this.getOrInitializeProject(projectId);

    if (progress.steps[stepKey]?.done) return;

    progress.steps[stepKey] = {
      done: true,
      completedAt: new Date().toISOString(),
    };

    await this.progressRepository.save(progress);
  }

  /**
   * Marks a user-scoped step as done for a specific user. Idempotent.
   */
  async markUserStepDone(projectId: string, userId: string, stepKey: SetupStepKey): Promise<void> {
    if (!USER_SCOPED_STEP_KEYS.includes(stepKey)) return;

    const userProgress = await this.getOrInitializeUser(projectId, userId);

    if (userProgress.steps[stepKey]?.done) return;

    userProgress.steps[stepKey] = {
      done: true,
      completedAt: new Date().toISOString(),
    };

    await this.userProgressRepository.save(userProgress);
  }

  async resolveProjectIdByDataMartId(dataMartId: string): Promise<string | null> {
    const row = await this.dataMartRepository
      .createQueryBuilder('dm')
      .select('dm.projectId', 'projectId')
      .where('dm.id = :dataMartId', { dataMartId })
      .getRawOne<{ projectId: string }>();
    return row?.projectId ?? null;
  }

  // ── Project-level progress ──

  private async getOrInitializeProject(projectId: string): Promise<ProjectSetupProgress> {
    const existing = await this.progressRepository.findOne({ where: { projectId } });
    if (existing) return existing;

    const steps = await this.computeProjectInitialState(projectId);
    const entity = this.progressRepository.create({
      projectId,
      stepsSchemaVersion: 1,
      steps,
    });

    try {
      return await this.progressRepository.save(entity);
    } catch {
      const retried = await this.progressRepository.findOne({ where: { projectId } });
      if (retried) return retried;
      throw new Error(`Failed to initialize setup progress for project ${projectId}`);
    }
  }

  private async computeProjectInitialState(projectId: string): Promise<ProjectSetupSteps> {
    const steps = createEmptySteps();
    const now = new Date().toISOString();

    const [
      hasStorage,
      hasDraftDataMart,
      hasPublishedDataMart,
      hasDestination,
      hasReport,
      hasTeammates,
    ] = await Promise.all([
      this.checkStorageExists(projectId),
      this.checkDraftDataMartExists(projectId),
      this.checkPublishedDataMartExists(projectId),
      this.checkDestinationExists(projectId),
      this.checkReportExists(projectId),
      this.checkTeammatesInvited(projectId),
    ]);

    if (hasStorage) steps.hasStorage = { done: true, completedAt: now };
    if (hasDraftDataMart) steps.hasDraftDataMart = { done: true, completedAt: now };
    if (hasPublishedDataMart) steps.hasPublishedDataMart = { done: true, completedAt: now };
    if (hasDestination) steps.hasDestination = { done: true, completedAt: now };
    if (hasReport) steps.hasReport = { done: true, completedAt: now };
    if (hasTeammates) steps.hasTeammatesInvited = { done: true, completedAt: now };

    // hasReportRun is user-scoped — stays false at project level

    return steps;
  }

  // ── User-level progress ──

  private async getOrInitializeUser(
    projectId: string,
    userId: string
  ): Promise<ProjectSetupUserProgress> {
    const existing = await this.userProgressRepository.findOne({
      where: { projectId, userId },
    });
    if (existing) return existing;

    const steps = await this.computeUserInitialState(projectId, userId);
    const entity = this.userProgressRepository.create({
      projectId,
      userId,
      stepsSchemaVersion: 1,
      steps,
    });

    try {
      return await this.userProgressRepository.save(entity);
    } catch {
      const retried = await this.userProgressRepository.findOne({
        where: { projectId, userId },
      });
      if (retried) return retried;
      throw new Error(
        `Failed to initialize user setup progress for project ${projectId}, user ${userId}`
      );
    }
  }

  private async computeUserInitialState(
    projectId: string,
    userId: string
  ): Promise<Record<string, StepState>> {
    const steps: Record<string, StepState> = {
      hasReportRun: { done: false, completedAt: null },
    };

    const hasReportRun = await this.checkUserReportRunExists(projectId, userId);
    if (hasReportRun) {
      steps.hasReportRun = { done: true, completedAt: new Date().toISOString() };
    }

    return steps;
  }

  // ── Existence checks ──

  private async checkStorageExists(projectId: string): Promise<boolean> {
    const count = await this.dataStorageRepository.count({
      where: { projectId },
      take: 1,
    });
    return count > 0;
  }

  private async checkDraftDataMartExists(projectId: string): Promise<boolean> {
    const count = await this.dataMartRepository.count({
      where: { projectId },
      take: 1,
    });
    return count > 0;
  }

  private async checkPublishedDataMartExists(projectId: string): Promise<boolean> {
    const count = await this.dataMartRepository.count({
      where: { projectId, status: DataMartStatus.PUBLISHED },
      take: 1,
    });
    return count > 0;
  }

  private async checkDestinationExists(projectId: string): Promise<boolean> {
    const count = await this.dataDestinationRepository.count({
      where: { projectId },
      take: 1,
    });
    return count > 0;
  }

  private async checkReportExists(projectId: string): Promise<boolean> {
    const dataMarts = await this.dataMartRepository.find({
      where: { projectId },
      select: ['id'],
    });
    if (dataMarts.length === 0) return false;

    const dataMartIds = dataMarts.map(dm => dm.id);
    const count = await this.reportRepository
      .createQueryBuilder('report')
      .where('report.dataMartId IN (:...dataMartIds)', { dataMartIds })
      .limit(1)
      .getCount();
    return count > 0;
  }

  private async checkUserReportRunExists(projectId: string, userId: string): Promise<boolean> {
    const dataMarts = await this.dataMartRepository.find({
      where: { projectId },
      select: ['id'],
    });
    if (dataMarts.length === 0) return false;

    const dataMartIds = dataMarts.map(dm => dm.id);
    const count = await this.dataMartRunRepository
      .createQueryBuilder('run')
      .where('run.dataMartId IN (:...dataMartIds)', { dataMartIds })
      .andWhere('run.status = :status', { status: DataMartRunStatus.SUCCESS })
      .andWhere('run.createdById = :userId', { userId })
      .andWhere('run.type IN (:...types)', { types: REPORT_RUN_TYPES })
      .limit(1)
      .getCount();
    return count > 0;
  }

  private async checkTeammatesInvited(projectId: string): Promise<boolean> {
    try {
      const members = await this.idpProjectionsFacade.getProjectMembers(projectId);
      return members.length > 1;
    } catch {
      return false;
    }
  }
}
