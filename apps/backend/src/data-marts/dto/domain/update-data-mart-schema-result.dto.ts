import { FormulaViolation } from '../../calculated-fields/formula-violations';
import { DataMartDto } from './data-mart.dto';

/** The saved Data Mart plus every non-blocking formula warning this save surfaced. */
export interface UpdateDataMartSchemaResult extends DataMartDto {
  warnings: FormulaViolation[];
}
