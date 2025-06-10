import { DataStorageType } from '../../model/types/data-storage-type.enum';
import type { DataStorageResponseDto } from '../types';

// Create mock data for testing
export const mockDataStorages: DataStorageResponseDto[] = [
  {
    id: '1',
    type: DataStorageType.GOOGLE_BIGQUERY,
    title: 'Marketing BigQuery',
    createdAt: new Date(2025, 0, 15).toISOString(),
    modifiedAt: new Date(2025, 5, 1).toISOString(),
    credentials: {
      serviceAccount: '',
    },
    config: {
      projectId: 'marketing-project-123',
      location: 'US',
      datasetId: 'dataset-123',
    },
  },
  {
    id: '2',
    type: DataStorageType.AWS_ATHENA,
    title: 'Sales Data Warehouse',
    createdAt: new Date(2025, 2, 10).toISOString(),
    modifiedAt: new Date(2025, 5, 5).toISOString(),
    credentials: {
      secretAccessKey: '123-qwerty',
      accessKeyId: 'qwerty-456',
    },
    config: {
      region: 'us-east-1',
      databaseName: 'sales_analytics',
      outputBucket: 's3://qwerty-bucket/path',
    },
  },
  {
    id: '3',
    type: DataStorageType.GOOGLE_BIGQUERY,
    title: 'Customer Analytics',
    createdAt: new Date(2025, 3, 20).toISOString(),
    modifiedAt: new Date(2025, 4, 15).toISOString(),
    config: {
      projectId: 'customer-project-123',
      location: 'EU',
      datasetId: 'dataset-123',
    },
    credentials: {
      serviceAccount: 'customer_data',
    },
  },
];

// Mock single DataStorage for detail view
export const mockDataStorageDetail: DataStorageResponseDto = {
  id: '1',
  type: DataStorageType.GOOGLE_BIGQUERY,
  title: 'Marketing BigQuery',
  createdAt: new Date(2025, 0, 15).toISOString(),
  modifiedAt: new Date(2025, 5, 1).toISOString(),
  config: {
    projectId: 'marketing-project-123',
    location: 'US',
    datasetId: 'dataset-123',
  },
  credentials: {
    serviceAccount: '-',
  },
};
