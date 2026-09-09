import type { DataMartSchema } from '../../data-mart-schema.types.ts';

type WithoutConnectionStatus<T> = T extends readonly unknown[]
  ? { [Index in keyof T]: WithoutConnectionStatus<T[Index]> }
  : T extends object
    ? {
        [Key in keyof T as Key extends 'status' ? never : Key]: WithoutConnectionStatus<T[Key]>;
      }
    : T;

/**
 * Update data mart schema request data transfer object
 */
export interface UpdateDataMartSchemaRequestDto {
  /**
   * Updated schema of the data mart
   */
  schema: WithoutConnectionStatus<DataMartSchema>;
}
