import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { ReportLike } from '../../dto/domain/report-like-read-plan';
import { DataMart } from '../../entities/data-mart.entity';

/**
 * Makes a Data Mart's definition ready to run before storage code builds a query from it — today:
 * resolves the Data Mart references (`[Title](dm:<id>)`) in a SQL Data Mart's query.
 *
 * Storage-side code depends on this interface, bound to its implementation through
 * `DATA_MART_DEFINITION_RESOLVER`, rather than on the implementing service.
 */
export interface DataMartDefinitionResolver {
  /** The definition ready to run; the very same object when nothing needs resolving. */
  resolveDefinition(
    dataMart: Pick<DataMart, 'id' | 'storage' | 'definition'> &
      Partial<Pick<DataMart, 'projectId' | 'title'>>
  ): Promise<DataMartDefinition | undefined>;

  /** The report itself when nothing needs resolving, otherwise a copy with a resolved Data Mart. */
  withResolvedDataMart<T extends ReportLike>(report: T): Promise<T>;
}
