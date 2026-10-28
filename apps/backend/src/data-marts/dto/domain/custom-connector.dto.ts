export interface CustomConnectorActor {
  projectId: string;
  userId: string;
  roles?: string[];
}

export interface CustomConnectorMetadataInput {
  title?: string;
  description?: string | null;
  logo?: string | null;
  docUrl?: string | null;
}

export interface CreateCustomConnectorInput extends CustomConnectorMetadataInput {
  name: string;
  title: string;
  manifest: Record<string, unknown>;
}

export interface CustomConnectorCreatedDto {
  id: string;
  name: string;
  title: string;
}

export interface CustomConnectorDto extends CustomConnectorCreatedDto {
  description: string | null;
  logo: string | null;
  docUrl: string | null;
  activeVersionId: string | null;
  activeVersion: number | null;
}

export interface CustomConnectorVersionStateDto {
  version: number;
  status: 'draft' | 'published';
}

export interface CustomConnectorDetailDto extends CustomConnectorDto {
  versions: Array<CustomConnectorVersionStateDto & { publishedAt: Date | null }>;
}

export interface CustomConnectorVersionDto extends CustomConnectorVersionStateDto {
  manifest: Record<string, unknown>;
}

export interface CustomConnectorPublishedDto extends CustomConnectorVersionStateDto {
  publishedAt?: Date | null;
  warnings: string[];
}

export interface CustomConnectorActivatedDto {
  activeVersionId: string | null;
  activeVersion: number;
}

export interface CustomConnectorTestInput {
  manifest: Record<string, unknown>;
  node: string;
  configuration: Record<string, unknown>;
  maxRows?: number;
  maxPages?: number;
}

export interface CustomConnectorTestResultDto {
  rows: Record<string, unknown>[];
  logs: string[];
  error: string | null;
  sample: Record<string, unknown>[];
}
