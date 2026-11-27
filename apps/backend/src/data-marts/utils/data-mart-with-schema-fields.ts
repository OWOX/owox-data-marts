import type {
  DataMartSchema,
  DataMartSchemaField,
} from '../data-storage-types/data-mart-schema.type';
import { DataMart } from '../entities/data-mart.entity';

/**
 * A copy of `dataMart` whose schema carries `fields`, for one read or one dry run to see the Data
 * Mart differently. Never the entity itself: the caller must not persist the change by accident.
 *
 * Keeps the prototype: `DataMart` exposes its owner ids as accessors, which a spread would drop.
 */
export function dataMartWithSchemaFields(
  dataMart: DataMart,
  fields: readonly DataMartSchemaField[]
): DataMart {
  return Object.assign(
    Object.create(Object.getPrototypeOf(dataMart) as object) as DataMart,
    dataMart,
    { schema: { ...dataMart.schema, fields } as DataMartSchema }
  );
}
