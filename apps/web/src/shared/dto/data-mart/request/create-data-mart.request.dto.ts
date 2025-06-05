import { DataStorageType } from '../../enums';

/**
 * Data transfer object for creating a new data mart
 */
export interface CreateDataMartRequestDto {
  /**
   * Title of the data mart
   */
  title: string;

  /**
   * Storage type for the data mart
   */
  storage: DataStorageType;
}
