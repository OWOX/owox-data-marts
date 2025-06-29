import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { Report } from '../../entities/report.entity';
import { ReportDataDescription } from '../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../dto/domain/report-data-batch.dto';

/**
 * Interface for reading report data from a data storage
 */
export interface DataStorageReportReader extends TypedComponent<DataStorageType> {
  /**
   * Prepares report data for reading
   */
  prepareReportData(report: Report): Promise<ReportDataDescription>;

  /**
   * Reads a batch of report data
   */
  readReportDataBatch(batchId?: string, maxDataRows?: number): Promise<ReportDataBatch>;

  /**
   * Finalizes the report reading process
   */
  finalize(): Promise<void>;
}
