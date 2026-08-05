import { Allow, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PutPluginCollectionDocumentApiDto {
  @ApiProperty({ description: 'A JSON value. Do not store credentials, tokens or secrets.' })
  @Allow()
  document: unknown;

  @ApiPropertyOptional({ description: 'Required for entity-bound collections.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  parentId?: string;
}

export class PluginCollectionDocumentApiDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() parentId?: string;
  @ApiProperty() document: unknown;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

export class PluginCollectionPageApiDto {
  @ApiProperty({ type: [PluginCollectionDocumentApiDto] }) items: PluginCollectionDocumentApiDto[];
  @ApiProperty({ nullable: true }) nextCursor: string | null;
}
