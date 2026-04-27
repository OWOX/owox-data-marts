/**
 * Generic contract for browsing resources in a data storage.
 *
 * Terminology is storage-agnostic:
 *  - namespace  = top-level container  (BigQuery project, Snowflake database, Databricks catalog …)
 *  - group      = second-level grouping (BigQuery dataset, Snowflake schema …) — carried as
 *                 `groupId` on every StorageResourceLeaf so the UI can cluster leaves without
 *                 a separate fetch
 *  - leaf       = selectable end resource (table or view)
 */

import type { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import type { DataStorageType } from '../enums/data-storage-type.enum';
import type { DataStorage } from '../../entities/data-storage.entity';

export interface StorageResourceNode {
  id: string;
  /** Human-friendly name when it differs from the id (e.g. GBQ project friendlyName). */
  label?: string;
}

export interface StorageResourceLeaf extends StorageResourceNode {
  /** Parent group identifier (dataset, schema, …). */
  groupId: string;
  type: 'TABLE' | 'VIEW';
  /** Fully qualified reference ready to be pasted into the Data Mart definition field. */
  fullyQualifiedName: string;
}

export type StorageResourceFilter = 'TABLE' | 'VIEW';

/**
 * Capability interface for singleton provider services that support resource browsing.
 * Extends {@link TypedComponent} so instances can be registered with {@link TypeResolver}.
 *
 * Each implementation receives the full {@link DataStorage} entity on every call so that
 * it can resolve credentials and config at call time (the service itself is stateless).
 */
export interface IStorageResourceBrowserProvider extends TypedComponent<DataStorageType> {
  /**
   * Returns all top-level containers visible with the storage credentials.
   * For BigQuery these are GCP projects; for Snowflake these are databases; etc.
   */
  listNamespaces(storage: DataStorage): Promise<StorageResourceNode[]>;

  /**
   * Returns all leaf resources (tables / views) within the given namespace, as a flat
   * array enriched with `groupId` for client-side grouping.
   *
   * @param storage      The data storage entity (provides credentials and config).
   * @param namespaceId  Top-level container identifier returned by {@link listNamespaces}.
   * @param filter       Optional type filter — omit to return both tables and views.
   */
  listLeafResources(
    storage: DataStorage,
    namespaceId: string,
    filter?: StorageResourceFilter
  ): Promise<StorageResourceLeaf[]>;
}
