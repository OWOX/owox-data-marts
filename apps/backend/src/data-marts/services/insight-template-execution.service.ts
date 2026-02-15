import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartTemplateFacadeImpl } from '../template/data-mart-template.facade.impl';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartRunService } from './data-mart-run.service';
import { InsightTemplateSourceDataService } from './insight-template-source-data.service';

@Injectable()
export class InsightTemplateExecutionService {
  private readonly logger = new Logger(InsightTemplateExecutionService.name);

  constructor(
    private readonly dataMartRunService: DataMartRunService,
    @InjectRepository(InsightTemplate)
    private readonly insightTemplateRepository: Repository<InsightTemplate>,
    private readonly systemTimeService: SystemTimeService,
    private readonly templateFacade: DataMartTemplateFacadeImpl,
    private readonly sourceDataService: InsightTemplateSourceDataService
  ) {}

  async run(
    dataMart: DataMart,
    insightTemplate: InsightTemplate,
    createdById: string,
    runType: RunType
  ): Promise<string> {
    this.validateDataMartForTemplateRun(dataMart);

    const isRunning = await this.dataMartRunService.isInsightTemplateRunning(insightTemplate.id);
    if (isRunning) {
      throw new BusinessViolationException(
        'Insight Template is already running. Please wait until it finishes'
      );
    }

    const dataMartRun = await this.createRun(dataMart, insightTemplate, createdById, runType);

    await this.insightTemplateRepository.update(insightTemplate.id, {
      lastManualDataMartRunId: dataMartRun.id,
      output: '',
      outputUpdatedAt: this.systemTimeService.now(),
    });

    await this.execute(dataMart, insightTemplate, dataMartRun).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Insight Template execution failed: ${errorMessage}`, error?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId: dataMartRun.id,
        userId: createdById,
      });
    });

    return dataMartRun.id;
  }

  private validateDataMartForTemplateRun(dataMart: DataMart): void {
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException('DataMart is not published');
    }
  }

  private async createRun(
    dataMart: DataMart,
    insightTemplate: InsightTemplate,
    createdById: string,
    runType: RunType
  ): Promise<DataMartRun> {
    return this.dataMartRunService.createAndMarkInsightTemplateRunAsPending(
      dataMart,
      insightTemplate,
      {
        createdById,
        runType,
      }
    );
  }

  private async execute(dataMart: DataMart, insightTemplate: InsightTemplate, run: DataMartRun) {
    const runId = run.id;
    await this.dataMartRunService.markInsightTemplateRunAsStarted(run);

    const logs: string[] = [];
    const errors: string[] = [];
    let generatedOutput: string | null = null;

    const pushLog = (message: Record<string, unknown>) => {
      logs.push(
        JSON.stringify({
          at: this.systemTimeService.now(),
          ...message,
        })
      );
    };

    try {
      pushLog({ type: 'log', message: 'Insight Template run started' });

      const context = await this.sourceDataService.buildRenderContext(dataMart, insightTemplate);
      const result = await this.templateFacade.render({
        template: insightTemplate.template ?? '',
        context,
      });

      generatedOutput = result.rendered ?? '';

      if (generatedOutput.length > 0) {
        pushLog({ type: 'output', output: generatedOutput });
      }

      pushLog({ type: 'log', message: 'Insight Template run completed' });

      await this.dataMartRunService.markInsightTemplateRunAsFinished(run, {
        status: DataMartRunStatus.SUCCESS,
        logs,
        errors,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(
        JSON.stringify({
          type: 'error',
          at: this.systemTimeService.now(),
          error: message,
        })
      );

      await this.dataMartRunService.markInsightTemplateRunAsFinished(run, {
        status: DataMartRunStatus.FAILED,
        logs,
        errors,
      });

      this.logger.error(`Insight Template run failed: ${message}`, (e as Error)?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
        userId: run.createdById,
      });
    } finally {
      const updatePayload: Record<string, unknown> = {
        lastManualDataMartRunId: run.id,
      };

      if (generatedOutput !== null) {
        updatePayload.output = generatedOutput;
        updatePayload.outputUpdatedAt = this.systemTimeService.now();
      }

      await this.insightTemplateRepository.update(insightTemplate.id, updatePayload);
    }
  }
}
