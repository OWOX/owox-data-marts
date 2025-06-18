export interface DirectStorageConfig {
  path: string;
  objectType: 'VIEW' | 'TABLE' | 'SHARDED_TABLE';
}
