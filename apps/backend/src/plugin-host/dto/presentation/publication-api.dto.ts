import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GithubAccessMode } from '../../enums/github-access-mode.enum';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';
import { ReleaseRejectionCode } from '../../enums/release-rejection-code.enum';

export class PublishPluginApiDto {
  @ApiProperty({
    description: 'GitHub repository, as a URL or owner/name.',
    example: 'https://github.com/OWOX/example-plugin',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  repository: string;

  @ApiProperty({ enum: PluginPublicationScope, description: 'Authority level to publish at.' })
  @IsEnum(PluginPublicationScope)
  scope: PluginPublicationScope;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Deployment scope only. Projects to add to the audience. Cannot be combined with allProjects.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  projectIds?: string[];

  @ApiPropertyOptional({
    description:
      'Deployment scope only. Every current and future project. Indivisible: projects cannot be excluded from it.',
  })
  @IsOptional()
  @IsBoolean()
  allProjects?: boolean;
}

export class ReleaseRejectionApiDto {
  @ApiProperty() tagName: string;
  @ApiProperty({ type: String, nullable: true }) githubReleaseId: string | null;
  @ApiProperty({ enum: ReleaseRejectionCode }) code: ReleaseRejectionCode;
  @ApiProperty({ description: 'Publisher-only detail. Never returned on member-facing routes.' })
  detail: string;
}

export class PluginPublisherDiagnosticsApiDto {
  @ApiProperty({ type: String, nullable: true }) deliveryUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) commitSha: string | null;
  @ApiProperty({ enum: GithubAccessMode, nullable: true, type: String })
  accessMode: GithubAccessMode | null;
  @ApiProperty({ type: String, nullable: true }) syncedAt: string | null;
  @ApiProperty({ type: [String] }) acceptedSemvers: string[];
  @ApiProperty({ type: [String] }) unchangedSemvers: string[];
  @ApiProperty({ type: [ReleaseRejectionApiDto] }) rejections: ReleaseRejectionApiDto[];
}

export class PublicationResponseApiDto {
  @ApiProperty() publicationId: string;
  @ApiProperty() pluginId: string;

  @ApiProperty({
    description:
      'Canonical owner/name, which is what unpublish takes. Present for private repositories too: only the caller who may manage this publication ever sees it.',
  })
  repository: string;
  @ApiProperty({ enum: PluginPublicationScope }) scope: PluginPublicationScope;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ description: 'Deployment scope only.' }) allProjects: boolean;
  @ApiProperty({
    type: [String],
    description: 'Active audience; empty unless allProjects is false.',
  })
  audienceProjectIds: string[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current version, if any release is eligible.',
  })
  currentSemver: string | null;

  @ApiProperty({
    type: PluginPublisherDiagnosticsApiDto,
    description:
      'Source diagnostics for publishers only. Includes release rejections from the last sync.',
  })
  diagnostics: PluginPublisherDiagnosticsApiDto;
}

export class UpdatePluginByRepositoryApiDto {
  @ApiProperty({
    description: 'GitHub repository, as a URL or owner/name.',
    example: 'https://github.com/OWOX/example-plugin',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  repository: string;
}
