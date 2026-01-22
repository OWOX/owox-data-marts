import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../../interfaces/data-mart-schema-parser.interface';
import {
    BigqueryDataMartSchema,
    BigQueryDataMartSchemaSchema,
} from '../../bigquery/schemas/bigquery-data-mart.schema';

/**
 * OWOX Legacy Schema Parser.
 * Uses BigQuery schema format (same as BigQuery schema parser).
 */
@Injectable()
export class OwoxLegacySchemaParser implements DataMartSchemaParser {
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    async validateAndParse(schema: unknown): Promise<BigqueryDataMartSchema> {
        const result = BigQueryDataMartSchemaSchema.safeParse(schema);
        if (!result.success) {
            throw new BusinessViolationException(
                `Failed to validate OWOX Legacy schema:\n${result.error.errors[0].message}`,
                { zodErrors: result.error.errors }
            );
        }
        return result.data;
    }
}
