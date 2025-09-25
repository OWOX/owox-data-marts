import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { ReportDataDescription } from '../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../dto/domain/report-data-batch.dto';
import { Report } from '../../entities/report.entity';

/**
 * Interface for writing reports to data destinations
 * Implementations handle the specifics of writing data to different destination types
 */
export interface DataDestinationReportWriter extends TypedComponent<DataDestinationType> {
  /**
   * Prepares the destination for writing a report
   *
   * @param report - The report entity to be written
   * @param reportDataDescription - Description of the report data structure
   */
  prepareToWriteReport(report: Report, reportDataDescription: ReportDataDescription): Promise<void>;

  /**
   * Writes a batch of report data to the destination
   *
   * @param reportDataBatch - Batch of data to write
   */
  writeReportDataBatch(reportDataBatch: ReportDataBatch): Promise<void>;

  /**
   * Finalizes the report writing process
   * Performs any necessary cleanup or finalization steps
   */
  finalize(): Promise<void>;
}
