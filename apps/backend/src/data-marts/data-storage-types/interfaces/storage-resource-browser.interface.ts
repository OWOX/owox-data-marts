/**
 * Generic contract for browsing resources in a data storage.
 *
 * Each storage adapter that supports resource browsing implements this interface.
 * Terminology is storage-agnostic:
 *  - namespace  = top-level container  (BigQuery project, Snowflake database, Databricks catalog …)
 *  - group      = second-level grouping (BigQuery dataset, Snowflake schema …) — carried as
 *                 `groupId` on every StorageResourceLeaf so the UI can cluster leaves without
 *                 a separate fetch
 *  - leaf       = selectable end resource (table or view)
 */

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

export interface IStorageResourceBrowser {
  /**
   * Returns all top-level containers visible with the storage credentials.
   * For BigQuery these are GCP projects; for Snowflake these are databases; etc.
   */
  listNamespaces(): Promise<StorageResourceNode[]>;

  /**
   * Returns all leaf resources (tables / views) within the given namespace, as a flat
   * array enriched with `groupId` for client-side grouping.
   *
   * @param namespaceId  Top-level container identifier from `listNamespaces`.
   * @param filter       Optional type filter — omit to return both tables and views.
   */
  listLeafResources(
    namespaceId: string,
    filter?: StorageResourceFilter
  ): Promise<StorageResourceLeaf[]>;
}
