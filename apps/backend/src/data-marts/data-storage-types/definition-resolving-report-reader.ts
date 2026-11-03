import { ModuleRef } from '@nestjs/core';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { ReportLike } from '../dto/domain/report-like-read-plan';
import { DataStorageType } from './enums/data-storage-type.enum';
import {
  DataStorageReportReader,
  PrepareReportDataOptions,
} from './interfaces/data-storage-report-reader.interface';
import { DataStorageReportReaderState } from './interfaces/data-storage-report-reader-state.interface';
import { DataMartDefinitionResolver } from './interfaces/data-mart-definition-resolver.interface';

/**
 * A report reader that resolves the Data Mart's definition before the storage reader builds its
 * own query from it. Without an `sqlOverride` (no output controls, no joins) every storage reader
 * reads `report.dataMart.definition` directly, and seven callers reach that path — wrapping the
 * reader once covers all of them.
 */
export class DefinitionResolvingReportReader implements DataStorageReportReader {
  constructor(
    private readonly inner: DataStorageReportReader,
    private readonly definitions: DataMartDefinitionResolver
  ) {}

  get type(): DataStorageType {
    return this.inner.type;
  }

  get honorsQueryTimeout(): boolean | undefined {
    return this.inner.honorsQueryTimeout;
  }

  async prepareReportData(
    report: ReportLike,
    options?: PrepareReportDataOptions
  ): Promise<ReportDataDescription> {
    // An override is final SQL already; only the definition path needs resolving.
    const ready = options?.sqlOverride
      ? report
      : await this.definitions.withResolvedDataMart(report);
    return this.inner.prepareReportData(ready, options);
  }

  readReportDataBatch(batchId?: string, maxDataRows?: number): Promise<ReportDataBatch> {
    return this.inner.readReportDataBatch(batchId, maxDataRows);
  }

  finalize(): Promise<void> {
    return this.inner.finalize();
  }

  getState(): DataStorageReportReaderState | null {
    return this.inner.getState();
  }

  initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    return this.inner.initFromState(state, reportDataHeaders);
  }
}

/** Resolves storage report readers, each wrapped in a {@link DefinitionResolvingReportReader}. */
export class DefinitionResolvingReportReaderResolver extends TypeResolver<
  DataStorageType,
  DataStorageReportReader
> {
  constructor(
    readers: DataStorageReportReader[],
    moduleRef: ModuleRef,
    private readonly definitions: DataMartDefinitionResolver
  ) {
    super(readers, moduleRef);
  }

  override async tryResolve(type: DataStorageType): Promise<DataStorageReportReader | undefined> {
    const reader = await super.tryResolve(type);
    return reader ? new DefinitionResolvingReportReader(reader, this.definitions) : undefined;
  }
}
