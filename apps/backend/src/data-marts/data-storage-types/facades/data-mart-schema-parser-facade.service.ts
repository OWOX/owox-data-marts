import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartSchemaParser } from '../interfaces/data-mart-schema-parser.interface';
import { DATA_MART_SCHEMA_PARSER_RESOLVER } from '../data-storage-providers';
import { DataMartSchema } from '../data-mart-schema.type';
import {
  collectCollidingCalculatedFieldNames,
  collectNestedCalculatedFieldNames,
  collectPrimaryKeyCalculatedFieldNames,
  collectUnrenderableCalculatedFieldNames,
} from '../../calculated-fields/calculated-field.utils';

@Injectable()
export class DataMartSchemaParserFacade {
  constructor(
    @Inject(DATA_MART_SCHEMA_PARSER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataMartSchemaParser>
  ) {}

  async validateAndParse(schema: unknown, storageType: DataStorageType): Promise<DataMartSchema> {
    const parser = await this.resolver.resolve(storageType);
    const result = await parser.validateAndParse(schema);

    // Every storage's parser funnels through here on save, so this is the one place that can
    // reject a nested calculated field regardless of storage type (only BigQuery/Snowflake can
    // even nest fields, but the check is harmless — and free — for the flat storages too).
    const nestedCalculatedFieldNames = collectNestedCalculatedFieldNames(result.fields);
    if (nestedCalculatedFieldNames.length > 0) {
      throw new BusinessViolationException(
        `Calculated field "${nestedCalculatedFieldNames[0]}" must be top-level: calculated fields are not supported on nested schema fields.`
      );
    }

    // Same seat and same reason as the collision check below: a calculated field's name is the
    // analyst's to choose, where a column's arrives from the warehouse, so it is the only schema
    // name this product can be asked to render something impossible from.
    const unrenderableNames = collectUnrenderableCalculatedFieldNames(result.fields);
    if (unrenderableNames.length > 0) {
      throw new BusinessViolationException(
        `Calculated field "${unrenderableNames[0]}" cannot be named that: a calculated field's name becomes a column alias in the generated SQL, so it may not contain a dot, a quote character (" or \`), a backslash or a line break.`
      );
    }

    // The Primary Key is emitted as physical column references, never as a substituted formula, so
    // a calculated field in it asks the warehouse for a column it does not have — on every Unique
    // Count, every join advertisement and every blended fan-out dedup that reads the same list.
    const primaryKeyCalculatedNames = collectPrimaryKeyCalculatedFieldNames(result.fields);
    if (primaryKeyCalculatedNames.length > 0) {
      throw new BusinessViolationException(
        `Calculated field "${primaryKeyCalculatedNames[0]}" cannot be part of the Primary Key: the key is written into the query as column names, and a calculated field has no column behind it — the query would ask the warehouse for a column that does not exist.`
      );
    }

    const collidingNames = collectCollidingCalculatedFieldNames(result.fields);
    if (collidingNames.length > 0) {
      throw new BusinessViolationException(
        `Calculated field "${collidingNames[0]}" uses a name another field of this Data Mart already has. A report, a formula reference and a destination all address a field by its name, so which of the two they reach would depend on the order of the fields — rename one of them.`
      );
    }

    return result;
  }
}
