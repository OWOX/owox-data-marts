import { Injectable, Scope } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';

@Injectable({ scope: Scope.TRANSIENT })
export class SnowflakeReportReader implements DataStorageReportReader {
  readonly type = DataStorageType.SNOWFLAKE;

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    // TODO: Implement proper report data preparation
    return new ReportDataDescription([], 0);
  }

  async readReportDataBatch(batchId?: string, maxDataRows?: number): Promise<ReportDataBatch> {
    // TODO: Implement proper batch reading
    return new ReportDataBatch([], null);
  }

  async finalize(): Promise<void> {
    // TODO: Implement finalization
  }

  getState(): DataStorageReportReaderState | null {
    // TODO: Implement state management
    return null;
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    // TODO: Implement state initialization
  }
}
