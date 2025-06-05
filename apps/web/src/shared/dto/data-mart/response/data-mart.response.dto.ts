import { DataStorageType } from '../../enums';

export interface DataMartResponseDto {
  /**
   * Unique identifier of the data mart
   */
  id: string;

  /**
   * Title of the data mart
   */
  title: string;

  /**
   * Storage type for the data mart
   */
  storageType: DataStorageType;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;
}
