export enum StorageResourceLevel {
  NAMESPACES = 'namespaces',
  RESOURCES = 'resources',
}

export class ListStorageResourcesCommand {
  constructor(
    public readonly storageId: string,
    public readonly projectIdContext: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly level: StorageResourceLevel,
    /** Top-level container ID (e.g. GCP project, Snowflake database). Required for level=resources. */
    public readonly namespaceId?: string,
    /** Optional type filter. Only meaningful for level=resources. */
    public readonly resourceType?: 'TABLE' | 'VIEW' | 'TABLE_PATTERN'
  ) {}
}
