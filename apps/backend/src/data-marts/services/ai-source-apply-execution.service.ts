import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  ApplyAiAssistantActionPayload,
  ApplyAiAssistantSessionCommand,
} from '../dto/domain/apply-ai-assistant-session.command';
import type { AiAssistantApplyStatus } from '../dto/domain/ai-assistant-apply.types';
import {
  InsightTemplateSourceType,
  InsightTemplateSources,
} from '../dto/schemas/insight-template/insight-template-source.schema';
import { AiAssistantSession } from '../entities/ai-assistant-session.entity';
import { DataMart } from '../entities/data-mart.entity';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { AiAssistantSessionService } from './ai-assistant-session.service';
import { InsightArtifactService } from './insight-artifact.service';
import { InsightTemplateService } from './insight-template.service';
import { InsightTemplateValidationService } from './insight-template-validation.service';
import { TemplateFullReplaceApplyService } from './template-edit-placeholder-tags/template-full-replace-apply.service';

interface AttachResult {
  templateUpdated: boolean;
  templateId: string | null;
  sourceKey: string | null;
}

interface ResolvedAttachPayload {
  templateId: string;
  sourceKey: string;
}

export interface ApplyExecutionResult {
  artifactId: string | null;
  artifactTitle: string | null;
  templateUpdated: boolean;
  templateId: string | null;
  sourceKey: string | null;
  status: AiAssistantApplyStatus;
  reason: string | null;
}

@Injectable()
export class AiSourceApplyExecutionService {
  constructor(
    @InjectRepository(InsightArtifact)
    private readonly artifactRepository: Repository<InsightArtifact>,
    @InjectRepository(InsightTemplate)
    private readonly templateRepository: Repository<InsightTemplate>,
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly insightArtifactService: InsightArtifactService,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightTemplateValidationService: InsightTemplateValidationService,
    private readonly templateFullReplaceApplyService: TemplateFullReplaceApplyService
  ) {}

  async getSession(command: ApplyAiAssistantSessionCommand): Promise<AiAssistantSession> {
    const session = await this.aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId(
      command.sessionId,
      command.dataMartId,
      command.projectId,
      command.userId
    );

    if (session.scope !== 'template') {
      throw new BusinessViolationException(
        'Ai Source Assistant currently supports only template scope sessions'
      );
    }

    return session;
  }

  async execute(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action: ApplyAiAssistantActionPayload
  ): Promise<ApplyExecutionResult> {
    switch (action.type) {
      case 'update_existing_source':
        return this.executeUpdateExistingSource(session, command, action);
      case 'create_and_attach_source':
        return this.executeCreateAndAttachSource(session, command, action);
      case 'replace_template_document':
        return this.executeReplaceTemplateDocument(session, command, action);
      case 'remove_source_from_template':
        return this.executeRemoveSourceFromTemplate(session, command, action);
      default:
        throw new BusinessViolationException(`Unsupported apply action type: ${action.type}`);
    }
  }

  private async executeUpdateExistingSource(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action: ApplyAiAssistantActionPayload
  ): Promise<ApplyExecutionResult> {
    const sql = await this.resolveSqlToApply(session, command);
    const artifact = await this.applySqlToArtifact(session, command, sql, action);
    const sourceResult: ApplyExecutionResult = {
      artifactId: artifact.id,
      artifactTitle: artifact.title,
      templateUpdated: false,
      templateId: null,
      sourceKey: null,
      status: 'updated',
      reason: 'update_existing_source',
    };

    return this.applyTemplateEditAfterSourceIfPresent(session, command, action, sourceResult);
  }

  private async executeCreateAndAttachSource(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action: ApplyAiAssistantActionPayload
  ): Promise<ApplyExecutionResult> {
    const attachPayload = this.resolveAttachPayload(session, action);
    const reuseResult = await this.tryReuseExistingTemplateSourceForAttach(
      session,
      command,
      attachPayload
    );
    if (reuseResult) {
      return this.applyTemplateEditAfterSourceIfPresent(session, command, action, reuseResult);
    }

    const explicitTargetArtifactId = this.normalizeOptional(action.targetArtifactId);
    if (explicitTargetArtifactId) {
      const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
        explicitTargetArtifactId,
        session.dataMartId,
        command.projectId
      );
      const attachResult = await this.attachArtifactToTemplate(
        session,
        artifact,
        command.projectId,
        attachPayload
      );
      const sourceResult: ApplyExecutionResult = {
        artifactId: artifact.id,
        artifactTitle: artifact.title,
        templateUpdated: attachResult.templateUpdated,
        templateId: attachResult.templateId,
        sourceKey: attachResult.sourceKey,
        status: attachResult.templateUpdated ? 'updated' : 'already_present',
        reason: 'attach_existing_source',
      };
      return this.applyTemplateEditAfterSourceIfPresent(session, command, action, sourceResult);
    }

    const sql = await this.resolveSqlToApply(session, command);
    const artifact = await this.applySqlToArtifact(session, command, sql, action);
    const attachResult = await this.attachArtifactToTemplate(
      session,
      artifact,
      command.projectId,
      attachPayload
    );

    const sourceResult: ApplyExecutionResult = {
      artifactId: artifact.id,
      artifactTitle: artifact.title,
      templateUpdated: attachResult.templateUpdated,
      templateId: attachResult.templateId,
      sourceKey: attachResult.sourceKey,
      status: 'updated',
      reason: 'create_and_attach_source',
    };
    return this.applyTemplateEditAfterSourceIfPresent(session, command, action, sourceResult);
  }

  private async tryReuseExistingTemplateSourceForAttach(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    attachPayload: ResolvedAttachPayload
  ): Promise<ApplyExecutionResult | null> {
    const templateId = this.normalizeOptional(attachPayload.templateId);
    if (!templateId) {
      return null;
    }

    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      templateId,
      session.dataMartId,
      command.projectId
    );
    const existingSource = (template.sources ?? []).find(
      source => source.key === attachPayload.sourceKey
    );
    if (!existingSource) {
      return null;
    }

    const existingArtifactId = existingSource.artifactId ?? null;
    const existingArtifact = existingArtifactId
      ? await this.insightArtifactService.getByIdAndDataMartIdAndProjectIdSafe(
          existingArtifactId,
          session.dataMartId,
          command.projectId
        )
      : null;
    const sqlOverride = this.normalizeOptional(command.sql);

    const templateUpdated = false;
    let status: AiAssistantApplyStatus = 'already_present';
    let reason: string | null = 'source_already_in_template';
    let resolvedArtifact = existingArtifact;

    if (
      sqlOverride &&
      existingArtifactId &&
      existingArtifact &&
      this.normalizeSqlForComparison(existingArtifact.sql) !==
        this.normalizeSqlForComparison(sqlOverride)
    ) {
      resolvedArtifact = await this.applySqlToArtifact(session, command, sqlOverride, {
        type: 'update_existing_source',
        sourceKey: attachPayload.sourceKey,
      });
      status = 'updated';
      reason = 'update_existing_source';
    }

    return {
      artifactId: resolvedArtifact?.id ?? existingArtifactId,
      artifactTitle: resolvedArtifact?.title ?? null,
      templateUpdated,
      templateId: template.id,
      sourceKey: attachPayload.sourceKey,
      status,
      reason,
    };
  }

  private async executeReplaceTemplateDocument(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action: ApplyAiAssistantActionPayload
  ): Promise<ApplyExecutionResult> {
    const templateId = this.resolveTemplateIdForAction(session, action);
    const text = typeof action.text === 'string' ? action.text : undefined;
    const tags = Array.isArray(action.tags) ? action.tags : undefined;

    if (!text) {
      throw new BusinessViolationException(
        'action.text is required for replace_template_document action'
      );
    }
    if (!tags) {
      throw new BusinessViolationException(
        'action.tags is required for replace_template_document action'
      );
    }

    const applyResult = await this.templateFullReplaceApplyService.apply({
      templateId,
      dataMartId: session.dataMartId,
      projectId: command.projectId,
      text,
      tags,
    });

    return {
      artifactId: null,
      artifactTitle: null,
      templateUpdated: applyResult.templateUpdated,
      templateId: applyResult.templateId,
      sourceKey: null,
      status: applyResult.status,
      reason: applyResult.reason,
    };
  }

  private async executeRemoveSourceFromTemplate(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action: ApplyAiAssistantActionPayload
  ): Promise<ApplyExecutionResult> {
    const templateId = this.resolveTemplateIdForAction(session, action);
    const sourceKey = this.resolveSourceKeyForAction(action);

    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      templateId,
      session.dataMartId,
      command.projectId
    );

    const originalSources = template.sources ?? [];
    const updatedSources = originalSources.filter(source => source.key !== sourceKey);
    const sourceRemoved = updatedSources.length !== originalSources.length;
    if (!sourceRemoved) {
      return {
        artifactId: null,
        artifactTitle: null,
        templateUpdated: false,
        templateId: template.id,
        sourceKey,
        status: 'no_op',
        reason: 'remove_source_no_changes',
      };
    }

    try {
      await this.insightTemplateValidationService.validateSources(updatedSources, {
        dataMartId: session.dataMartId,
        projectId: command.projectId,
      });
      template.sources = updatedSources;

      await this.templateRepository.save(template);
    } catch (error) {
      if (this.isTemplateValidationFailure(error)) {
        return {
          artifactId: null,
          artifactTitle: null,
          templateUpdated: false,
          templateId: template.id,
          sourceKey,
          status: 'validation_failed',
          reason: error instanceof Error ? error.message : 'template validation failed',
        };
      }

      throw error;
    }

    return {
      artifactId: null,
      artifactTitle: null,
      templateUpdated: true,
      templateId: template.id,
      sourceKey,
      status: 'updated',
      reason: 'remove_source_only',
    };
  }

  private async applyTemplateEditAfterSourceIfPresent(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action: ApplyAiAssistantActionPayload,
    sourceResult: ApplyExecutionResult
  ): Promise<ApplyExecutionResult> {
    if (!this.hasTemplateEditPayload(action)) {
      return sourceResult;
    }

    const templateEditResult = await this.executeReplaceTemplateDocument(session, command, action);
    if (templateEditResult.status === 'validation_failed') {
      // Fail fast to avoid committing source-only changes when a composite source+template apply is invalid.
      throw new BusinessViolationException(
        templateEditResult.reason ?? 'template validation failed'
      );
    }

    return {
      artifactId: sourceResult.artifactId,
      artifactTitle: sourceResult.artifactTitle,
      templateUpdated: sourceResult.templateUpdated || templateEditResult.templateUpdated,
      templateId: templateEditResult.templateId ?? sourceResult.templateId,
      sourceKey: sourceResult.sourceKey,
      status: templateEditResult.status === 'updated' ? 'updated' : sourceResult.status,
      reason:
        templateEditResult.status === 'updated' && sourceResult.status !== 'updated'
          ? templateEditResult.reason
          : (sourceResult.reason ?? templateEditResult.reason),
    };
  }

  private hasTemplateEditPayload(action: ApplyAiAssistantActionPayload): boolean {
    const text = this.normalizeOptional(action.text);
    return Boolean(text && Array.isArray(action.tags));
  }

  private resolveAttachPayload(
    session: AiAssistantSession,
    action: ApplyAiAssistantActionPayload
  ): ResolvedAttachPayload {
    const sourceKey = this.normalizeOptional(action.sourceKey);
    if (!sourceKey) {
      throw new BusinessViolationException(
        'sourceKey is required for create_and_attach_source action'
      );
    }

    const templateId = this.normalizeOptional(session.templateId);
    if (!templateId) {
      throw new BusinessViolationException(
        'templateId is required for attach operation in template scope'
      );
    }

    return {
      templateId,
      sourceKey,
    };
  }

  private resolveTemplateIdForAction(
    session: AiAssistantSession,
    _action: ApplyAiAssistantActionPayload
  ): string {
    const templateId = this.normalizeOptional(session.templateId);
    if (!templateId) {
      throw new BusinessViolationException(
        'templateId is required for template-scoped apply action'
      );
    }

    return templateId;
  }

  private resolveSourceKeyForAction(action: ApplyAiAssistantActionPayload): string {
    const sourceKey = this.normalizeOptional(action.sourceKey);
    if (!sourceKey) {
      throw new BusinessViolationException('sourceKey is required for snippet apply action');
    }

    return sourceKey;
  }

  private isTemplateValidationFailure(error: unknown): boolean {
    return (
      error instanceof BusinessViolationException &&
      error.message.toLowerCase().includes('template')
    );
  }

  private async resolveSqlToApply(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand
  ): Promise<string> {
    const sqlOverride = this.normalizeOptional(command.sql);
    if (sqlOverride) {
      return sqlOverride;
    }

    const assistantMessage =
      await this.aiAssistantSessionService.getAssistantMessageByIdAndSessionId(
        command.assistantMessageId,
        session.id
      );
    const sqlCandidate = this.extractSqlCandidateFromMessage(assistantMessage);
    if (sqlCandidate) {
      return sqlCandidate;
    }

    throw new BusinessViolationException(
      'SQL candidate is required. Provide `sql` or generate SQL in assistant first'
    );
  }

  private extractSqlCandidateFromMessage(message: { sqlCandidate?: string | null }): string | null {
    return this.normalizeOptional(message.sqlCandidate);
  }

  private async applySqlToArtifact(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    sql: string,
    action?: ApplyAiAssistantActionPayload
  ): Promise<InsightArtifact> {
    const explicitArtifactTitle = this.normalizeOptional(command.artifactTitle);
    const targetArtifactId = await this.resolveTargetArtifactId(session, command, action);

    if (targetArtifactId) {
      const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
        targetArtifactId,
        session.dataMartId,
        command.projectId
      );

      artifact.sql = sql;
      artifact.validationStatus = InsightArtifactValidationStatus.VALID;
      artifact.validationError = null;

      if (explicitArtifactTitle) {
        artifact.title = explicitArtifactTitle;
      }

      const saved = await this.artifactRepository.save(artifact);
      return saved;
    }

    const suggestedArtifactTitle =
      await this.aiAssistantSessionService.getSuggestedArtifactTitleFromLatestAssistantActions(
        session.id
      );
    const artifactTitle = explicitArtifactTitle ?? suggestedArtifactTitle ?? 'Untitled source';

    const created = this.artifactRepository.create({
      title: artifactTitle,
      sql,
      dataMart: { id: session.dataMartId } as DataMart,
      createdById: command.userId,
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    });

    const saved = await this.artifactRepository.save(created);
    return saved;
  }

  private async resolveTargetArtifactId(
    session: AiAssistantSession,
    command: ApplyAiAssistantSessionCommand,
    action?: ApplyAiAssistantActionPayload
  ): Promise<string | null> {
    const directTargetArtifactId = this.normalizeOptional(action?.targetArtifactId);
    if (directTargetArtifactId) {
      return directTargetArtifactId;
    }

    const sourceKey = this.normalizeOptional(action?.sourceKey);
    if (!sourceKey) {
      return null;
    }

    const templateId = this.normalizeOptional(session.templateId);
    if (!templateId) {
      return null;
    }

    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      templateId,
      session.dataMartId,
      command.projectId
    );
    const matchedSource = (template.sources ?? []).find(source => source.key === sourceKey);
    return this.normalizeOptional(matchedSource?.artifactId ?? null);
  }

  private async attachArtifactToTemplate(
    session: AiAssistantSession,
    artifact: InsightArtifact,
    projectId: string,
    attachToTemplate: ResolvedAttachPayload
  ): Promise<AttachResult> {
    const sourceKey = this.normalizeOptional(attachToTemplate.sourceKey);
    if (!sourceKey) {
      throw new BusinessViolationException('sourceKey is required for attach operation');
    }

    if (
      session.templateId &&
      attachToTemplate.templateId &&
      session.templateId !== attachToTemplate.templateId
    ) {
      throw new BusinessViolationException(
        'attachToTemplate.templateId must match session templateId'
      );
    }

    const templateId = attachToTemplate.templateId ?? this.normalizeOptional(session.templateId);
    if (!templateId) {
      throw new BusinessViolationException(
        'templateId is required for attach operation in template scope'
      );
    }

    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      templateId,
      session.dataMartId,
      projectId
    );
    const existingSources = template.sources ?? [];
    const existingByKey = existingSources.find(source => source.key === sourceKey);

    if (existingByKey) {
      const isSameSource =
        existingByKey.type === InsightTemplateSourceType.INSIGHT_ARTIFACT &&
        existingByKey.artifactId === artifact.id;

      if (!isSameSource) {
        throw new BusinessViolationException(`Source key "${sourceKey}" is already used`);
      }

      return {
        templateUpdated: false,
        templateId: template.id,
        sourceKey,
      };
    }

    const updatedSources: InsightTemplateSources = [
      ...existingSources,
      {
        key: sourceKey,
        type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
        artifactId: artifact.id,
      },
    ];

    await this.insightTemplateValidationService.validateSources(updatedSources, {
      dataMartId: session.dataMartId,
      projectId,
    });

    template.sources = updatedSources;

    await this.templateRepository.save(template);

    return {
      templateUpdated: true,
      templateId: template.id,
      sourceKey,
    };
  }

  private normalizeOptional(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private normalizeSqlForComparison(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
}
