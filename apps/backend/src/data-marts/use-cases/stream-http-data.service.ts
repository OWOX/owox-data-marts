import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AuthorizationContext } from '../../idp/types/auth.types';
import {
  DATA_STORAGE_ERROR_MAPPER_RESOLVER,
  DATA_STORAGE_REPORT_READER_RESOLVER,
} from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageErrorMapper } from '../data-storage-types/interfaces/data-storage-error-mapper.interface';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { StreamHttpDataCommand } from '../dto/domain/stream-http-data.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { Action, EntityType } from '../services/access-decision/access-decision.types';
import { AccessDecisionService } from '../services/access-decision/access-decision.service';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import { DataMartService } from '../services/data-mart.service';
import { ProjectBalanceService } from '../services/project-balance.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { HttpDataColumnResolver } from '../services/http-data/http-data-column-resolver.service';
import { HttpDataColumnValidator } from '../services/http-data/http-data-column-validator.service';
import {
  nativeColumnNames,
  visibleBlendedColumnNames,
  ReportingColumns,
} from '../services/http-data/http-data-column-sets.util';
import { HttpDataRequestValidator } from '../services/http-data/http-data-request-validator.service';
import { HttpDataStreamWriter } from '../services/http-data/http-data-stream-writer.service';
import {
  BlendableSchemaAccessor,
  BlendableSchemaService,
} from '../services/blendable-schema.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import {
  HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS,
  STREAM_BATCH_SIZE,
} from '../services/http-data/http-data.constants';
import {
  HTTP_DATA_FORMAT,
  HttpDataRunMetadata,
} from '../dto/schemas/http-data-run-metadata.schema';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { randomUUID } from 'crypto';

class StreamCancelledError extends Error {
  override readonly name = 'StreamCancelledError';
}

@Injectable()
export class StreamHttpDataService {
  private readonly logger = new Logger(StreamHttpDataService.name);

  constructor(
    private readonly requestValidator: HttpDataRequestValidator,
    private readonly columnResolver: HttpDataColumnResolver,
    private readonly columnValidator: HttpDataColumnValidator,
    private readonly streamWriter: HttpDataStreamWriter,
    private readonly dataMartRunService: DataMartRunService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly systemTimeService: SystemTimeService,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    @Inject(DATA_STORAGE_ERROR_MAPPER_RESOLVER)
    private readonly errorMapperResolver: TypeResolver<DataStorageType, DataStorageErrorMapper>
  ) {}

  async stream(command: StreamHttpDataCommand, res: Response): Promise<void> {
    if (this.gracefulShutdownService.isInShutdownMode()) {
      throw new ServiceUnavailableException('Server is shutting down');
    }

    const query = this.requestValidator.validate(command.rawQuery);
    const limit = query.limit;
    const ctx: AuthorizationContext = {
      userId: command.userId,
      projectId: command.projectId,
      roles: command.roles,
    };
    const accessor: BlendableSchemaAccessor = { userId: ctx.userId, roles: ctx.roles ?? [] };

    const dataMart = await this.loadAccessibleDataMart(command.dataMartId, ctx);
    const runId = randomUUID();
    const startedAt = this.systemTimeService.now();

    let reader: DataStorageReportReader | null = null;
    let baseMetadata: HttpDataRunMetadata | null = null;

    try {
      await this.dataMartService.actualizeSchemaInEntityIfExpired(
        dataMart,
        HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS
      );
      const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
        dataMart.id,
        dataMart.projectId,
        accessor
      );
      const reportingColumns: ReportingColumns = {
        native: nativeColumnNames(blendableSchema),
        blended: visibleBlendedColumnNames(blendableSchema),
      };
      const columns = this.columnResolver.resolve(query.columnSelector, reportingColumns);
      this.columnValidator.validate(
        { selectedColumns: columns, filter: query.filter, sort: query.sort },
        reportingColumns
      );
      await this.projectBalanceService.verifyCanPerformOperations(dataMart.projectId);

      const readPlan: ReportLikeReadPlan = {
        dataMart,
        columnConfig: columns,
        filterConfig: query.filter,
        sortConfig: query.sort,
        limitConfig: limit ?? null,
      };

      const decision = await this.blendedReportDataService.resolveBlendingDecision(
        readPlan,
        accessor
      );

      if (decision.needsBlending && !decision.blendedSql) {
        throw new InternalServerErrorException('Blended SQL was not produced for this Data Mart');
      }

      let sqlOverride: string | undefined = decision.blendedSql;
      let sqlOverrideParams = decision.params;
      const hasOutputControls =
        (query.filter?.length ?? 0) > 0 || (query.sort?.length ?? 0) > 0 || limit != null;
      if (!decision.needsBlending && hasOutputControls) {
        const composed = await this.reportSqlComposerService.compose(readPlan, accessor, decision);
        sqlOverride = composed.sql;
        sqlOverrideParams = composed.params;
      }

      baseMetadata = {
        format: HTTP_DATA_FORMAT,
        columns,
        filter: query.filter,
        sort: query.sort,
        limit,
      };

      reader = await this.readerResolver.resolve(dataMart.storage.type);
      const description = await reader.prepareReportData(readPlan, {
        sqlOverride,
        sqlOverrideParams,
        columnFilter: decision.columnFilter,
        blendedDataHeaders: decision.blendedDataHeaders,
      });

      const { rowCount, bytesWritten } = await this.streamRows(
        res,
        reader,
        description.dataHeaders,
        columns,
        runId
      );

      await this.recordSuccessfulRun(dataMart, ctx.userId, runId, startedAt, {
        ...baseMetadata,
        dataDescription: this.toMetadataDataDescription(description.dataHeaders),
        rowCount,
        bytesWritten,
        completed: true,
      });

      res.end();
    } catch (error) {
      const mappedError = await this.toClientFacingReadError(error, reader, dataMart, res);
      if (baseMetadata) {
        await this.recordFailedRun(
          dataMart,
          ctx.userId,
          runId,
          startedAt,
          { ...baseMetadata, completed: false },
          mappedError
        );
      }
      this.handleStreamFailure(res, mappedError);
    } finally {
      if (reader) await this.safelyFinalizeReader(reader);
    }
  }

  private async toClientFacingReadError(
    error: unknown,
    reader: DataStorageReportReader | null,
    dataMart: DataMart,
    res: Response
  ): Promise<unknown> {
    if (res.headersSent || error instanceof StreamCancelledError) {
      return error;
    }

    const mapper = await this.errorMapperResolver.resolve(dataMart.storage.type);
    return mapper.toStorageReadError(error, { force: reader !== null });
  }

  private async recordSuccessfulRun(
    dataMart: DataMart,
    createdById: string,
    runId: string,
    startedAt: Date,
    metadata: HttpDataRunMetadata
  ): Promise<void> {
    try {
      await this.dataMartRunService.recordHttpDataRun({
        runId,
        dataMart,
        createdById,
        startedAt,
        status: DataMartRunStatus.SUCCESS,
        metadata,
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist SUCCESS HTTP Data run ${runId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    try {
      await this.consumptionTrackingService.registerHttpDataRunConsumption(dataMart, runId);
    } catch (err) {
      this.logger.warn(
        `Failed to register HTTP Data run consumption ${runId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async recordFailedRun(
    dataMart: DataMart,
    createdById: string,
    runId: string,
    startedAt: Date,
    metadata: HttpDataRunMetadata,
    error: unknown
  ): Promise<void> {
    const message = this.clientFacingErrorMessage(error);
    try {
      await this.dataMartRunService.recordHttpDataRun({
        runId,
        dataMart,
        createdById,
        startedAt,
        status: DataMartRunStatus.FAILED,
        metadata,
        errors: [message],
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist FAILED HTTP Data run ${runId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private clientFacingErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string' && message.length > 0) return message;
      }
    }

    return error instanceof Error ? error.message : String(error);
  }

  private toMetadataDataDescription(
    dataHeaders: ReportDataHeader[]
  ): HttpDataRunMetadata['dataDescription'] {
    return {
      dataHeaders: dataHeaders.map(header => ({
        name: header.name,
        title: header.alias,
        description: header.description,
        type: header.storageFieldType,
      })),
    };
  }

  private async loadAccessibleDataMart(
    dataMartId: string,
    ctx: AuthorizationContext
  ): Promise<DataMart> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, ctx.projectId);

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new NotFoundException(`Data Mart ${dataMartId} not found`);
    }

    const allowed = await this.accessDecisionService.canAccess(
      ctx.userId,
      ctx.roles ?? [],
      EntityType.DATA_MART,
      dataMart.id,
      Action.USE,
      ctx.projectId
    );
    if (!allowed) {
      throw new ForbiddenException(`Access to Data Mart ${dataMartId} is not allowed`);
    }

    return dataMart;
  }

  private async streamRows(
    res: Response,
    reader: DataStorageReportReader,
    dataHeaders: ReportDataHeader[],
    requestedColumns: string[],
    runId: string
  ): Promise<{ rowCount: number; bytesWritten: number }> {
    const fieldIndexMap = this.buildFieldIndexMap(dataHeaders, requestedColumns);
    const abortController = new AbortController();
    const onClose = () =>
      abortController.abort(
        new StreamCancelledError('Client disconnected before stream completion')
      );
    const onError = (error: unknown) =>
      abortController.abort(
        error instanceof Error ? error : new StreamCancelledError('Response stream error')
      );
    res.once('close', onClose);
    res.once('error', onError);

    try {
      let rowCount = 0;
      let bytesWritten = 0;
      let headersSent = false;
      let nextBatchId: string | undefined | null = undefined;

      do {
        this.throwIfAborted(abortController.signal);
        if (this.gracefulShutdownService.isInShutdownMode()) {
          throw new StreamCancelledError('Server entered shutdown mode during stream');
        }
        const batch = await this.readBatchOrAbort(reader, nextBatchId, abortController.signal);

        if (!headersSent) {
          this.streamWriter.initHeaders(res, { runId });
          headersSent = true;
        }

        for (const row of batch.dataRows) {
          this.throwIfAborted(abortController.signal);

          const obj: Record<string, unknown> = {};
          for (let i = 0; i < requestedColumns.length; i++) {
            const idx = fieldIndexMap[i];
            obj[requestedColumns[i]] = idx === -1 ? null : row[idx];
          }

          const chunk = this.streamWriter.serializeRow(obj);
          await this.streamWriter.writeChunk(res, chunk, abortController.signal);
          bytesWritten += chunk.length;
          rowCount += 1;
        }

        nextBatchId = batch.nextDataBatchId;
      } while (nextBatchId);

      return { rowCount, bytesWritten };
    } finally {
      res.off('close', onClose);
      res.off('error', onError);
    }
  }

  private abortReason(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error('Stream aborted');
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw this.abortReason(signal);
    }
  }

  private async readBatchOrAbort(
    reader: DataStorageReportReader,
    nextBatchId: string | undefined | null,
    signal: AbortSignal
  ): ReturnType<DataStorageReportReader['readReportDataBatch']> {
    if (signal.aborted) {
      throw this.abortReason(signal);
    }

    const readPromise = reader.readReportDataBatch(nextBatchId ?? undefined, STREAM_BATCH_SIZE);
    readPromise.catch(() => undefined);

    let onAbort!: () => void;
    const abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.abortReason(signal));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    abortPromise.catch(() => undefined);

    try {
      return await Promise.race([readPromise, abortPromise]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private buildFieldIndexMap(
    dataHeaders: ReportDataHeader[],
    requestedColumns: string[]
  ): number[] {
    const headerIndex = new Map<string, number>();
    dataHeaders.forEach((header, index) => headerIndex.set(header.name, index));
    return requestedColumns.map(column => headerIndex.get(column) ?? -1);
  }

  private handleStreamFailure(res: Response, error: unknown): void {
    if (!res.headersSent) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`HTTP Data stream failed after headers sent: ${message}`);
    if (!res.closed) {
      res.destroy(error instanceof Error ? error : new Error(message));
    }
  }

  private async safelyFinalizeReader(reader: DataStorageReportReader): Promise<void> {
    try {
      await reader.finalize();
    } catch (err) {
      this.logger.warn(
        `Reader finalize failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
