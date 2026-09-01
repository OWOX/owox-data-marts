import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';

export class PluginSourceApiDto {
  @ApiProperty({ description: 'GitHub account that owns the repository.' })
  ownerName: string;

  @ApiProperty() ownerUrl: string;

  @ApiPropertyOptional({
    description: 'Omitted for a private repository, whose name is not disclosed.',
  })
  repositoryUrl?: string;
}

export class PluginGalleryEntryApiDto {
  @ApiProperty() pluginId: string;
  @ApiProperty() displayName: string;
  @ApiProperty() description: string;

  @ApiProperty({ type: String, nullable: true, description: 'Null until a release is eligible.' })
  currentSemver: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Confirm this when installing: two versions can share a SemVer, so the number alone is not enough.',
  })
  currentVersionId: string | null;

  @ApiProperty({
    enum: PluginPublicationScope,
    isArray: true,
    description:
      'Why this is visible. Informational: the levels are independent, with no precedence.',
  })
  visibleViaScopes: PluginPublicationScope[];

  @ApiProperty({ description: 'Suspended plugins stay listed but cannot be opened or installed.' })
  suspended: boolean;

  @ApiProperty({ enum: ['not_installed', 'installed', 'uninstalled'] })
  installationState: string;

  @ApiProperty({ type: PluginSourceApiDto })
  source: PluginSourceApiDto;

  @ApiProperty({
    description:
      "When OWOX first learned of this plugin. The plugin record's own date, not the publication's: one more member listing an already-known plugin does not make it new.",
  })
  addedAt: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'When this deployment checks for a newer version on its own. Null while nothing publishes or installs the plugin, which takes it off daily maintenance.',
  })
  nextCheckAt: string | null;

  @ApiProperty({
    type: [Object],
    description: 'Credentials that must be selected before installation.',
  })
  credentialRequirements: Array<
    string | { id: string; definitionId?: string; optional: boolean; models?: readonly string[] }
  >;
}
