import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { GetPluginDetailsCommand } from '../dto/domain/get-plugin-details.command';
import { GetPluginGalleryCommand } from '../dto/domain/get-plugin-gallery.command';
import { GetPluginInstallationEntryCommand } from '../dto/domain/get-plugin-installation-entry.command';
import { InstallPluginCommand } from '../dto/domain/install-plugin.command';
import { ListInstallationsCommand } from '../dto/domain/list-installations.command';
import { ListPublicationsCommand } from '../dto/domain/list-publications.command';
import {
  InstalledPluginDto,
  PluginInstallationDto,
  PluginInstallationEntryDto,
} from '../dto/domain/plugin-installation.dto';
import { PluginPublicationDto } from '../dto/domain/plugin-publication.dto';
import {
  PluginGalleryEntryDto,
  PluginInstallationState,
  PluginSourceDto,
} from '../dto/domain/plugin-view.dto';
import { PublishPluginCommand, UnpublishPluginCommand } from '../dto/domain/publish-plugin.command';
import {
  PluginSuspensionDto,
  ResumePluginCommand,
  SuspendPluginCommand,
} from '../dto/domain/suspend-plugin.command';
import { UninstallPluginCommand } from '../dto/domain/uninstall-plugin.command';
import { PluginUpdateResultDto, UpdatePluginCommand } from '../dto/domain/update-plugin.command';
import {
  InstalledPluginApiDto,
  InstallPluginApiDto,
  PluginEntryApiDto,
  PluginInstallationApiDto,
  PluginUpdateResultApiDto,
} from '../dto/presentation/plugin-installation-api.dto';
import { PluginGalleryEntryApiDto } from '../dto/presentation/plugin-gallery-api.dto';
import {
  PluginSuspensionResponseApiDto,
  SuspendPluginApiDto,
} from '../dto/presentation/plugin-suspension-api.dto';
import {
  PluginPublisherDiagnosticsApiDto,
  PublicationResponseApiDto,
  PublishPluginApiDto,
  UpdatePluginByRepositoryApiDto,
} from '../dto/presentation/publication-api.dto';
import { PluginVersion } from '../entities/plugin-version.entity';
import { Plugin } from '../entities/plugin.entity';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPublisherDiagnosticsDto } from '../dto/domain/plugin-publication.dto';

export interface PluginViewContext {
  readonly scopes: PluginPublicationScope[];
  readonly installationState: PluginInstallationState;
}

const GITHUB_OWNER_URL = 'https://github.com';

/**
 * Maps between HTTP presentation, domain commands, and domain views.
 *
 * Two distinct methods for member vs publisher views rather than one taking a flag.
 * A flag would eventually default the wrong way somewhere, and the failure mode is
 * silently serving publisher diagnostics -- delivery URLs, commits, repository paths --
 * to every member.
 */
@Injectable()
export class PluginPresentationMapper {
  // --- commands (presentation / route params → domain) ---

  toPublishCommand(context: AuthorizationContext, dto: PublishPluginApiDto): PublishPluginCommand {
    return new PublishPluginCommand(dto.repository, dto.scope, context, {
      projectIds: dto.projectIds,
      allProjects: dto.allProjects,
    });
  }

  toUnpublishCommand(
    context: AuthorizationContext,
    dto: PublishPluginApiDto
  ): UnpublishPluginCommand {
    return new UnpublishPluginCommand(dto.repository, dto.scope, context, {
      projectIds: dto.projectIds,
      allProjects: dto.allProjects,
    });
  }

  toListPublicationsCommand(
    context: AuthorizationContext,
    scope: PluginPublicationScope
  ): ListPublicationsCommand {
    return new ListPublicationsCommand(scope, context);
  }

  toGetPluginGalleryCommand(context: AuthorizationContext): GetPluginGalleryCommand {
    return new GetPluginGalleryCommand(context);
  }

  toGetPluginDetailsCommand(
    pluginId: string,
    context: AuthorizationContext
  ): GetPluginDetailsCommand {
    return new GetPluginDetailsCommand(pluginId, context);
  }

  toListInstallationsCommand(
    context: AuthorizationContext,
    includeUninstalled: boolean
  ): ListInstallationsCommand {
    return new ListInstallationsCommand(context, includeUninstalled);
  }

  toGetPluginInstallationEntryCommand(
    installationId: string,
    context: AuthorizationContext
  ): GetPluginInstallationEntryCommand {
    return new GetPluginInstallationEntryCommand(installationId, context);
  }

  toInstallCommand(
    pluginId: string,
    context: AuthorizationContext,
    dto: InstallPluginApiDto
  ): InstallPluginCommand {
    return new InstallPluginCommand(pluginId, dto.expectedVersionId, context);
  }

  toUpdateCommand(pluginId: string, context: AuthorizationContext): UpdatePluginCommand {
    return new UpdatePluginCommand(context, pluginId);
  }

  toUpdateByRepositoryCommand(
    context: AuthorizationContext,
    dto: UpdatePluginByRepositoryApiDto
  ): UpdatePluginCommand {
    return new UpdatePluginCommand(context, undefined, dto.repository);
  }

  toUninstallCommand(pluginId: string, context: AuthorizationContext): UninstallPluginCommand {
    return new UninstallPluginCommand(pluginId, context);
  }

  toSuspendCommand(context: AuthorizationContext, dto: SuspendPluginApiDto): SuspendPluginCommand {
    return new SuspendPluginCommand(dto.repository, context, dto.note);
  }

  toResumeCommand(context: AuthorizationContext, dto: SuspendPluginApiDto): ResumePluginCommand {
    return new ResumePluginCommand(dto.repository, context, dto.note);
  }

  // --- entity → domain views ---

  toMemberDto(
    plugin: Plugin,
    version: PluginVersion | null,
    context: PluginViewContext
  ): PluginGalleryEntryDto {
    return {
      pluginId: plugin.id,
      // Falling back keeps a plugin with no eligible release recognisable rather than
      // blank, but the repository name is exactly what `toSource` withholds for a private
      // repository -- so that case falls back to the owner, which `toSource` discloses anyway.
      displayName:
        version?.displayName ?? (plugin.isPrivateRepo ? plugin.repoOwner : plugin.repoName),
      description: version?.description ?? '',
      currentSemver: version?.semver ?? null,
      currentVersionId: version?.id ?? null,
      visibleViaScopes: context.scopes,
      suspended: plugin.suspendedAt !== null,
      installationState: context.installationState,
      source: this.toSource(plugin),
      addedAt: plugin.createdAt.toISOString(),
      nextCheckAt: plugin.nextUpdateCheckAt?.toISOString() ?? null,
    };
  }

  // --- domain → presentation ---

  toGalleryEntryResponse(dto: PluginGalleryEntryDto): PluginGalleryEntryApiDto {
    return {
      pluginId: dto.pluginId,
      displayName: dto.displayName,
      description: dto.description,
      currentSemver: dto.currentSemver,
      currentVersionId: dto.currentVersionId,
      visibleViaScopes: dto.visibleViaScopes,
      suspended: dto.suspended,
      installationState: dto.installationState,
      source: { ...dto.source },
      addedAt: dto.addedAt,
      nextCheckAt: dto.nextCheckAt,
    };
  }

  toGalleryEntryResponseList(dtos: PluginGalleryEntryDto[]): PluginGalleryEntryApiDto[] {
    return dtos.map(dto => this.toGalleryEntryResponse(dto));
  }

  toPublicationResponse(dto: PluginPublicationDto): PublicationResponseApiDto {
    return {
      publicationId: dto.publicationId,
      pluginId: dto.pluginId,
      repository: dto.repository,
      scope: dto.scope,
      isActive: dto.isActive,
      allProjects: dto.allProjects,
      audienceProjectIds: [...dto.audienceProjectIds],
      currentSemver: dto.currentSemver,
      diagnostics: this.toDiagnosticsResponse(dto.diagnostics),
    };
  }

  toPublicationResponseList(dtos: PluginPublicationDto[]): PublicationResponseApiDto[] {
    return dtos.map(dto => this.toPublicationResponse(dto));
  }

  toDiagnosticsResponse(
    diagnostics: PluginPublisherDiagnosticsDto
  ): PluginPublisherDiagnosticsApiDto {
    return {
      deliveryUrl: diagnostics.deliveryUrl,
      commitSha: diagnostics.commitSha,
      accessMode: diagnostics.accessMode,
      syncedAt: diagnostics.syncedAt,
      acceptedSemvers: [...diagnostics.acceptedSemvers],
      unchangedSemvers: [...diagnostics.unchangedSemvers],
      rejections: diagnostics.rejections.map(row => ({ ...row })),
    };
  }

  toInstallationResponse(dto: PluginInstallationDto): PluginInstallationApiDto {
    return {
      installationId: dto.installationId,
      pluginId: dto.pluginId,
      createdAt: dto.createdAt,
      installedAt: dto.installedAt,
      uninstalledAt: dto.uninstalledAt,
    };
  }

  toInstalledPluginResponse(dto: InstalledPluginDto): InstalledPluginApiDto {
    return {
      ...this.toGalleryEntryResponse(dto),
      installationId: dto.installationId,
      installedAt: dto.installedAt,
      uninstalledAt: dto.uninstalledAt,
    };
  }

  toInstalledPluginResponseList(dtos: InstalledPluginDto[]): InstalledPluginApiDto[] {
    return dtos.map(dto => this.toInstalledPluginResponse(dto));
  }

  toInstallationEntryResponse(dto: PluginInstallationEntryDto): PluginEntryApiDto {
    return {
      deliveryUrl: dto.deliveryUrl,
      displayName: dto.displayName,
      pluginId: dto.pluginId,
      versionId: dto.versionId,
    };
  }

  toUpdateResultResponse(dto: PluginUpdateResultDto): PluginUpdateResultApiDto {
    return {
      pluginId: dto.pluginId,
      repository: dto.repository,
      currentVersionId: dto.currentVersionId,
      currentSemver: dto.currentSemver,
      outcome: dto.outcome,
      updated: dto.updated,
      nextCheckAt: dto.nextCheckAt,
      diagnostics: dto.diagnostics ? this.toDiagnosticsResponse(dto.diagnostics) : null,
    };
  }

  toSuspensionResponse(dto: PluginSuspensionDto): PluginSuspensionResponseApiDto {
    return {
      pluginId: dto.pluginId,
      suspended: dto.suspended,
      note: dto.note,
    };
  }

  /**
   * A private repository discloses its owner only. Its name and URL would confirm to a
   * member that one specific private repository exists.
   */
  private toSource(plugin: Plugin): PluginSourceDto {
    const owner = {
      ownerName: plugin.repoOwner,
      ownerUrl: `${GITHUB_OWNER_URL}/${plugin.repoOwner}`,
    };

    return plugin.isPrivateRepo ? owner : { ...owner, repositoryUrl: plugin.repoHtmlUrl };
  }
}
