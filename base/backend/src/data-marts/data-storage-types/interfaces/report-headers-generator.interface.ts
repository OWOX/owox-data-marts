import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchema } from '../data-mart-schema.type';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';

/**
 * Interface for generating report headers exclusively from data mart schema
 */
export interface ReportHeadersGenerator extends TypedComponent<DataStorageType> {
  /**
   * Generates headers based exclusively on data mart schema
   * @param dataMartSchema - The data mart schema to generate headers from
   * @returns Array of ReportDataHeader objects with metadata
   */
  generateHeaders(dataMartSchema: DataMartSchema): ReportDataHeader[];
}
