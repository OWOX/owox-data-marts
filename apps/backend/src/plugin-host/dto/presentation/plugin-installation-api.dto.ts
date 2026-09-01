import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { z } from 'zod';
import { IsZodValid } from '../../../common/validators/is-zod-valid.validator';
import { PluginUpdateCheckOutcome } from '../../use-cases/run-plugin-update-check.service';
import { PluginGalleryEntryApiDto } from './plugin-gallery-api.dto';
import { PluginPublisherDiagnosticsApiDto } from './publication-api.dto';

const CredentialSelectionsSchema = z
  .record(z.string().trim().min(1).max(255), z.string().uuid().nullable())
  .refine(value => Object.keys(value).length <= 50, 'too many Credential selections');

export class InstallPluginApiDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The version the member was shown. Any installed member can move the plugin forward, so a mismatch means the confirmation screen is out of date.',
  })
  @IsOptional()
  @IsString()
  expectedVersionId: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    description: 'Credential requirement handle to selected project Credential id.',
  })
  @IsOptional()
  @IsZodValid(CredentialSelectionsSchema)
  credentialSelections?: Record<string, string | null>;
}

export class PluginInstallationApiDto {
  @ApiProperty() installationId: string;
  @ApiProperty() pluginId: string;

  @ApiProperty({ description: 'First ever installation. Survives every uninstall and restore.' })
  createdAt: Date;

  @ApiProperty({ description: 'Most recent installation or restoration.' })
  installedAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  uninstalledAt: Date | null;
}

export class InstalledPluginApiDto extends PluginGalleryEntryApiDto {
  @ApiProperty() installationId: string;
  @ApiProperty() installedAt: Date;
  @ApiProperty({ type: Date, nullable: true }) uninstalledAt: Date | null;
}

export class PluginEntryApiDto {
  @ApiProperty({ description: 'What the sandboxed iframe loads.' })
  deliveryUrl: string;

  @ApiProperty() displayName: string;

  @ApiProperty({
    description:
      'Stable plugin identity. Unlike versionId it survives releases, renames and transfers, so it is what a plugin may key its own state on.',
  })
  pluginId: string;

  @ApiProperty() versionId: string;

  @ApiProperty({ type: [Object] })
  credentialHandles: Array<
    | { name: string; kind: 'exact' }
    | { name: string; kind: 'ai'; models: Array<'fast' | 'reasoning' | 'embedding'> }
  >;
}

export class PluginRuntimeTokenApiDto {
  @ApiProperty({ description: 'Installation-bound OWOX access token held by the Plugin Host.' })
  runtimeToken: string;

  @ApiProperty({ description: 'Access token lifetime in seconds.' })
  expiresIn: number;
}

export class PluginUpdateResultApiDto {
  @ApiProperty() pluginId: string;

  @ApiProperty({
    description:
      'Canonical owner/name after resolution. For a private repository the name is withheld from anyone but a deployment publisher, as `owner/***`, matching what the plugin view discloses.',
  })
  repository: string;

  @ApiProperty({ type: String, nullable: true })
  currentVersionId: string | null;

  @ApiProperty({ type: String, nullable: true })
  currentSemver: string | null;

  @ApiProperty({
    enum: ['updated', 'up_to_date', 'already_running', 'failed'],
    description:
      'What the managed check did. A failure leaves the current version active and the daily schedule untouched.',
  })
  outcome: PluginUpdateCheckOutcome;

  @ApiProperty({
    description:
      'False when nothing newer was found, which is a normal outcome rather than a failure.',
  })
  updated: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'When this deployment checks again on its own. Asking now does not move it.',
  })
  nextCheckAt: string | null;

  @ApiPropertyOptional({
    type: PluginPublisherDiagnosticsApiDto,
    nullable: true,
    description:
      'Present only for deployment publishers. Release rejections and source diagnostics stay off the ordinary member path.',
  })
  diagnostics?: PluginPublisherDiagnosticsApiDto | null;
}
