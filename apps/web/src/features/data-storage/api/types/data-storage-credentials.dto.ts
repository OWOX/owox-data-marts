export interface DataStorageCredentialsDto {
  serviceAccount?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  //other credentials depend on a storage type
}
