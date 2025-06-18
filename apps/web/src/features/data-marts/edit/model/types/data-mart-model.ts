import type { DataMartSourceConfig } from './data-mart-source-config.ts';
import { DataStorageType } from '../../../../data-storage';

/**
 * Data mart domain model
 */
export interface DataMart {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Title
   */
  title: string;

  /**
   * Storage type
   */
  storageType: DataStorageType;

  /**
   * Source configuration
   */
  source?: DataMartSourceConfig;

  /**
   * Creation date
   */
  createdAt: Date;

  /**
   * Last modification date
   */
  modifiedAt: Date;
}
