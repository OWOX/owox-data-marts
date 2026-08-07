import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdpModule } from '../idp/idp.module';
import { CommonModule } from '../common/common.module';
import { DataMartsModule } from '../data-marts/data-marts.module';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from '../config/plugin-collections-data-source-options.config';
import { PLUGIN_RUNTIME_AUTHORIZER } from '../idp/ports/plugin-runtime-authorizer.port';
import { PluginHostConfigService } from './config/plugin-host.config';
import { PluginAuditEvent } from './entities/plugin-audit-event.entity';
import { PluginInstallation } from './entities/plugin-installation.entity';
import { PluginPublicationProject } from './entities/plugin-publication-project.entity';
import { PluginPublication } from './entities/plugin-publication.entity';
import { PluginVersion } from './entities/plugin-version.entity';
import { Plugin } from './entities/plugin.entity';
import { PluginAdminController } from './controllers/plugin-admin.controller';
import { PluginGalleryController } from './controllers/plugin-gallery.controller';
import { PluginInstallationsController } from './controllers/plugin-installations.controller';
import { PluginPublicationsController } from './controllers/plugin-publications.controller';
import { GithubApiService } from './services/github-api.service';
import { GithubAuthService } from './services/github-auth.service';
import { PLUGIN_INSTALLATION_LOOKUP } from './facades/plugin-installation-lookup.facade';
import { PluginInstallationLookupFacade } from './facades/plugin-installation-lookup.facade.impl';
import { PluginAuditService } from './services/plugin-audit.service';
import { PluginInstallationService } from './services/plugin-installation.service';
import { PluginPublicationService } from './services/plugin-publication.service';
import { PluginUpdateScheduleService } from './services/plugin-update-schedule.service';
import { PluginVersionService } from './services/plugin-version.service';
import { PluginService } from './services/plugin.service';
import { PublicationAuthorizationService } from './services/publication-authorization.service';
import { PluginRuntimeAuthorizerService } from './services/plugin-runtime-authorizer.service';
import { RemoteUrlValidatorService } from './services/remote-url-validator.service';
import { PluginPresentationMapper } from './mappers/plugin-presentation.mapper';
import { GetPluginDetailsService } from './use-cases/get-plugin-details.service';
import { GetPluginInstallationEntryService } from './use-cases/get-plugin-installation-entry.service';
import { InstallPluginService } from './use-cases/install-plugin.service';
import { ListInstallationsService } from './use-cases/list-installations.service';
import { UninstallPluginService } from './use-cases/uninstall-plugin.service';
import { UpdatePluginService } from './use-cases/update-plugin.service';
import { IssuePluginRuntimeTokenService } from './use-cases/issue-plugin-runtime-token.service';
import { GetPluginGalleryService } from './use-cases/get-plugin-gallery.service';
import { ListPublicationsService } from './use-cases/list-publications.service';
import { PublishPluginService } from './use-cases/publish-plugin.service';
import { ResumePluginService } from './use-cases/resume-plugin.service';
import { RunPluginUpdateCheckService } from './use-cases/run-plugin-update-check.service';
import { PluginUpdateCheckProcessor } from './system-triggers/plugin-update-check.processor';
import { SuspendPluginService } from './use-cases/suspend-plugin.service';
import { SyncPluginReleasesService } from './use-cases/sync-plugin-releases.service';
import { UnpublishPluginService } from './use-cases/unpublish-plugin.service';
import { PluginCollectionsController } from './collections/controllers/plugin-collections.controller';
import { PluginCollectionAuditEvent } from './collections/entities/plugin-collection-audit-event.collection.entity';
import { PluginCollectionDocument } from './collections/entities/plugin-collection-document.collection.entity';
import { PluginCollectionUsage } from './collections/entities/plugin-collection-usage.collection.entity';
import { PluginCollectionMapper } from './collections/mappers/plugin-collection.mapper';
import { PluginCollectionAuditService } from './collections/services/plugin-collection-audit.service';
import { PluginCollectionAuthorizationService } from './collections/services/plugin-collection-authorization.service';
import { PluginCollectionDeclarationService } from './collections/services/plugin-collection-declaration.service';
import { PluginCollectionPersistenceService } from './collections/services/plugin-collection-persistence.service';
import { PluginCollectionQuotaService } from './collections/services/plugin-collection-quota.service';
import { DeletePluginCollectionDocumentService } from './collections/use-cases/delete-plugin-collection-document.service';
import { GetPluginCollectionDocumentService } from './collections/use-cases/get-plugin-collection-document.service';
import { ListPluginCollectionDocumentsService } from './collections/use-cases/list-plugin-collection-documents.service';
import { PutPluginCollectionDocumentService } from './collections/use-cases/put-plugin-collection-document.service';

/**
 * Plugin Host API: a module of this backend, not a separately deployed service.
 *
 * Owns the plugin records, publication authorization, Gallery queries, installation
 * lifecycle, GitHub synchronization and audit.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plugin,
      PluginVersion,
      PluginPublication,
      PluginPublicationProject,
      PluginInstallation,
      PluginAuditEvent,
    ]),
    TypeOrmModule.forFeature(
      [PluginCollectionDocument, PluginCollectionUsage, PluginCollectionAuditEvent],
      PLUGIN_COLLECTIONS_DATA_SOURCE
    ),
    // Controllers here use @Auth, and IdpGuard resolves its dependencies from this module.
    IdpModule,
    // PluginHostConfigService reads the deployment's public origin from here rather than
    // keeping a second copy of it.
    CommonModule,
    DataMartsModule,
  ],
  // Order is load-bearing. Every controller here mounts on 'plugins', and Nest matches
  // routes in registration order, so PluginGalleryController's catch-all GET ':pluginId'
  // swallows any literal one-segment GET registered after it -- 'plugins/installations'
  // was answered as a lookup for a plugin named "installations". The gallery goes last.
  controllers: [
    PluginCollectionsController,
    PluginPublicationsController,
    PluginAdminController,
    PluginInstallationsController,
    PluginGalleryController,
  ],
  providers: [
    PluginCollectionMapper,
    PluginCollectionAuditService,
    PluginCollectionAuthorizationService,
    PluginCollectionDeclarationService,
    PluginCollectionPersistenceService,
    PluginCollectionQuotaService,
    ListPluginCollectionDocumentsService,
    GetPluginCollectionDocumentService,
    PutPluginCollectionDocumentService,
    DeletePluginCollectionDocumentService,
    PluginHostConfigService,
    GithubAuthService,
    GithubApiService,
    RemoteUrlValidatorService,
    PluginService,
    PluginVersionService,
    PluginAuditService,
    PublicationAuthorizationService,
    PluginPublicationService,
    SyncPluginReleasesService,
    PublishPluginService,
    UnpublishPluginService,
    ListPublicationsService,
    PluginPresentationMapper,
    GetPluginGalleryService,
    GetPluginDetailsService,
    SuspendPluginService,
    ResumePluginService,
    PluginInstallationService,
    PluginUpdateScheduleService,
    RunPluginUpdateCheckService,
    PluginUpdateCheckProcessor,
    InstallPluginService,
    UninstallPluginService,
    ListInstallationsService,
    GetPluginInstallationEntryService,
    UpdatePluginService,
    IssuePluginRuntimeTokenService,
    PluginInstallationLookupFacade,
    { provide: PLUGIN_INSTALLATION_LOOKUP, useExisting: PluginInstallationLookupFacade },
    PluginRuntimeAuthorizerService,
    { provide: PLUGIN_RUNTIME_AUTHORIZER, useExisting: PluginRuntimeAuthorizerService },
  ],
  exports: [
    PluginHostConfigService,
    SyncPluginReleasesService,
    PublishPluginService,
    UnpublishPluginService,
    PLUGIN_INSTALLATION_LOOKUP,
    PLUGIN_RUNTIME_AUTHORIZER,
  ],
})
export class PluginHostModule {}
