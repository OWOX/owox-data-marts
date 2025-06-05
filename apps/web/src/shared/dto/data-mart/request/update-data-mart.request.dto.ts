import { DataStorageType } from '../../enums';

/**
 * Data transfer object for updating an existing data mart
 */
export interface UpdateDataMartRequestDto {
  /**
   * Title of the data mart
   */
  title?: string;

  /**
   * Storage type for the data mart
   */
  storage?: DataStorageType;
}
