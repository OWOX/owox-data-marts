import { ApiProperty } from '@nestjs/swagger';
import { ConnectorDefinitionVersionStatus } from '../../entities/connector-definition-version.entity';

/**
 * Response payloads of ConnectorDefinitionController.
 *
 * These classes exist to give the custom-connector wire shape a name the compiler can
 * check: every handler used to return an anonymous object literal, so a renamed or
 * dropped field changed the payload without failing a single build. The builder UI
 * (apps/web/src/features/connector-builder) mirrors these shapes by hand, and its copy
 * has no compile-time link back here — the schema assertions in
 * connector-definition.controller.openapi.spec.ts are what turns a drift into a failure.
 *
 * They document what the handlers already return; nothing here reshapes a response.
 */

export class CustomConnectorListItemResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'MyCustomApi' })
  name: string;

  @ApiProperty({ example: 'My Custom API' })
  title: string;

  @ApiProperty({ type: String, example: 'Reads orders from our internal API', nullable: true })
  description: string | null;

  @ApiProperty({ type: String, example: 'base64-encoded-logo', nullable: true })
  logo: string | null;

  @ApiProperty({ type: String, example: 'https://docs.example.com/my-api', nullable: true })
  docUrl: string | null;

  @ApiProperty({
    type: String,
    example: '0f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f',
    nullable: true,
    description: 'Id of the version currently served to runs. Null until something is published.',
  })
  activeVersionId: string | null;

  @ApiProperty({
    type: 'integer',
    example: 1,
    minimum: 1,
    nullable: true,
    description: 'Version number behind activeVersionId, resolved for display.',
  })
  activeVersion: number | null;
}

export class CustomConnectorVersionStateResponseApiDto {
  @ApiProperty({ type: 'integer', example: 1, minimum: 1 })
  version: number;

  @ApiProperty({
    enum: ConnectorDefinitionVersionStatus,
    example: ConnectorDefinitionVersionStatus.DRAFT,
  })
  status: ConnectorDefinitionVersionStatus;
}

export class CustomConnectorVersionSummaryResponseApiDto extends CustomConnectorVersionStateResponseApiDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2024-01-02T15:30:00.000Z',
    nullable: true,
    description: 'Null while the version is still a draft.',
  })
  publishedAt: Date | null;
}

export class CustomConnectorDetailResponseApiDto extends CustomConnectorListItemResponseApiDto {
  @ApiProperty({
    type: [CustomConnectorVersionSummaryResponseApiDto],
    description: 'Every version of this connector, oldest first.',
  })
  versions: CustomConnectorVersionSummaryResponseApiDto[];
}

export class CreateCustomConnectorResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'MyCustomApi' })
  name: string;

  @ApiProperty({ example: 'My Custom API' })
  title: string;
}

export class CustomConnectorVersionResponseApiDto extends CustomConnectorVersionStateResponseApiDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The declarative manifest stored for this version.',
  })
  manifest: Record<string, unknown>;
}

export class PublishCustomConnectorResponseApiDto extends CustomConnectorVersionStateResponseApiDto {
  /**
   * Optional because the handler forwards the stored column verbatim rather than
   * defaulting it, so the key is absent when the column carries no value.
   */
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2024-01-02T15:30:00.000Z',
    required: false,
    nullable: true,
  })
  publishedAt?: Date | null;
}

export class ActivateCustomConnectorVersionResponseApiDto {
  @ApiProperty({ type: String, example: '0f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f', nullable: true })
  activeVersionId: string | null;

  @ApiProperty({ type: 'integer', example: 2, minimum: 1 })
  activeVersion: number;
}

export class DeleteCustomConnectorResponseApiDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class ConnectorTestResultResponseApiDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Records the node produced, capped by the request maxRows.',
  })
  rows: Record<string, unknown>[];

  @ApiProperty({ type: [String] })
  logs: string[];

  @ApiProperty({ type: String, example: null, nullable: true })
  error: string | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Raw upstream records captured for field discovery, before record selection.',
  })
  sample: Record<string, unknown>[];
}
