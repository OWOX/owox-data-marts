import type { DataMartSchema } from '../../data-mart-schema.types.ts';

/**
 * Update data mart schema request data transfer object
 */
export interface UpdateDataMartSchemaRequestDto {
  /**
   * Updated schema of the data mart
   */
  schema: DataMartSchema;
}
