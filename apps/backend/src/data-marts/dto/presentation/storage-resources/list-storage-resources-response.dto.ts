import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorageNamespaceNodeDto {
  @ApiProperty({
    description: 'Namespace identifier (e.g. GCP project ID, Snowflake database name)',
    example: 'my-gcp-project',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Human-friendly name when different from id',
    example: 'My GCP Project',
  })
  label?: string;
}

export class StorageResourceLeafDto {
  @ApiProperty({ description: 'Resource identifier (table or view name)', example: 'orders' })
  id: string;

  @ApiProperty({
    description: 'Parent group identifier (dataset, schema, …)',
    example: 'analytics_prod',
  })
  groupId: string;

  @ApiProperty({ description: 'Resource type', enum: ['TABLE', 'VIEW'] })
  type: 'TABLE' | 'VIEW';

  @ApiProperty({
    description: 'Fully qualified name ready to use in a Data Mart definition',
    example: 'my-gcp-project.analytics_prod.orders',
  })
  fullyQualifiedName: string;

  @ApiPropertyOptional({
    description: "Where the resource's data lives, e.g. a BigQuery dataset location",
    example: 'EU',
  })
  location?: string;

  @ApiPropertyOptional({
    description:
      'True when the resource lives in a different location than the one the storage runs ' +
      'queries in, so a data mart on this storage cannot read it. Omitted when either ' +
      'location is unknown.',
  })
  locationMismatch?: boolean;
}

export class ListStorageResourcesResponseDto {
  @ApiPropertyOptional({ type: [StorageNamespaceNodeDto] })
  namespaces?: StorageNamespaceNodeDto[];

  @ApiPropertyOptional({ type: [StorageResourceLeafDto] })
  resources?: StorageResourceLeafDto[];
}
