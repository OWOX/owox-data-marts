import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { serializeSqliteTransactions } from '../../../../../config/sqlite-transaction-serializer';
import type { IdpProjectionsFacade } from '../../../../../idp/facades/idp-projections.facade';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { GetProjectSetupTool } from './get-project-setup.tool';
import { UpdateProjectDescriptionTool } from './update-project-description.tool';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import type { PublicOriginService } from '../../../../../common/config/public-origin.service';
import { CreateProjectSettingsTable1783949127000 } from '../../../../../migrations/1783949127000-create-project-settings-table';
import { AddProjectSettingsRevision1792400000000 } from '../../../../../migrations/1792400000000-add-project-settings-revision';
import { ProjectSettings } from '../../../../../project-settings/entities/project-settings.entity';
import { ProjectSettingsService } from '../../../../../project-settings/services/project-settings.service';
import { ProjectSettingsMapper } from '../../../../../project-settings/mappers/project-settings.mapper';
import { McpProjectSetupMapper } from '../../../../../project-settings/mappers/mcp-project-setup.mapper';
import { GetProjectSettingsService } from '../../../../../project-settings/use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from '../../../../../project-settings/use-cases/update-project-description.service';
import { McpProjectSetupFacadeImpl } from '../../../../../project-settings/facades/mcp-project-setup.facade.impl';
import { ProjectSettingsFacadeImpl } from '../../../../../project-settings/facades/project-settings.facade.impl';

// Keep identity decorators out of this persistence boundary; the real MCP admission is exercised.
jest.mock('../../../../../idp', () => ({
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
}));
import { ProjectSettingsController } from '../../../../../project-settings/controllers/project-settings.controller';

describe('Project setup REST/MCP persistence boundary', () => {
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
  } as McpAuthContext;
  let database: DataSource;
  let settings: ProjectSettingsService;
  let read: GetProjectSetupTool;
  let update: UpdateProjectDescriptionTool;
  let controller: ProjectSettingsController;
  let currentRoles: ('admin' | 'editor')[];

  beforeEach(async () => {
    database = serializeSqliteTransactions(
      new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [ProjectSettings] })
    );
    await database.initialize();
    const runner = database.createQueryRunner();
    await new CreateProjectSettingsTable1783949127000().up(runner);
    await new AddProjectSettingsRevision1792400000000().up(runner);
    await runner.release();
    settings = new ProjectSettingsService(database.getRepository(ProjectSettings));
    currentRoles = ['admin'];
    const idp = {
      getProjectForUser: async () => ({ id: 'project-1', title: 'Project', roles: currentRoles }),
    } as unknown as IdpProjectionsFacade;
    const mapper = new ProjectSettingsMapper();
    const updateUseCase = new UpdateProjectDescriptionService(settings, mapper);
    const facade = new McpProjectSetupFacadeImpl(
      idp,
      settings,
      new McpProjectSetupMapper(),
      updateUseCase
    );
    const auth = new SetupAuthorizationService(idp);
    read = new GetProjectSetupTool(auth, facade, {
      getPublicOrigin: () => 'https://app.test',
    } as PublicOriginService);
    update = new UpdateProjectDescriptionTool(auth, facade);
    controller = new ProjectSettingsController(
      new GetProjectSettingsService(settings, mapper),
      updateUseCase,
      mapper
    );
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('round trips absent/read/replace/clear across MCP, app settings and the existing Business description facade', async () => {
    expect((await read.handler({}, context)).structuredContent).toMatchObject({
      description: null,
      revision: 0,
      can_update_description: true,
    });
    const saved = await update.handler(
      { description: '  # Metrics\n\n**Revenue** means net.  ', expected_revision: 0 },
      context
    );
    expect(saved.structuredContent).toEqual({
      description: '# Metrics\n\n**Revenue** means net.',
      revision: 1,
    });
    expect(await controller.getSettings(context as never)).toEqual({
      description: '# Metrics\n\n**Revenue** means net.',
      revision: 1,
    });
    expect(await new ProjectSettingsFacadeImpl(settings).getDescription('project-1')).toBe(
      '# Metrics\n\n**Revenue** means net.'
    );
    await update.handler({ description: null, expected_revision: 1 }, context);
    expect((await read.handler({}, context)).structuredContent).toMatchObject({
      description: null,
      revision: 2,
    });
  });

  it('rejects stale MCP after a legacy REST update', async () => {
    await update.handler({ description: 'Initial', expected_revision: 0 }, context);
    expect(
      await controller.updateDescription(context as never, { description: 'Legacy REST' })
    ).toEqual({ description: 'Legacy REST', revision: 2 });
    await expect(
      update.handler({ description: 'Stale', expected_revision: 1 }, context)
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await controller.getSettings(context as never)).toEqual({
      description: 'Legacy REST',
      revision: 2,
    });
  });

  it('allows exactly one actual conditional REST/MCP first save', async () => {
    const outcomes = await Promise.allSettled([
      controller.updateDescription(context as never, { description: 'REST', expectedRevision: 0 }),
      update.handler({ description: 'MCP', expected_revision: 0 }, context),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(
      (outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult).reason
    ).toBeInstanceOf(ConflictException);
    expect(await controller.getSettings(context as never)).toMatchObject({ revision: 1 });
  });

  it('rejects a revoked admin at the real domain boundary before persistence', async () => {
    currentRoles = ['editor'];
    await expect(
      update.handler({ description: 'Denied', expected_revision: 0 }, context)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await settings.findByProjectId('project-1')).toBeNull();
  });

  it('migrates a preexisting description to revision zero and supports rollback without losing text', async () => {
    const runner = database.createQueryRunner();
    const migration = new AddProjectSettingsRevision1792400000000();
    await migration.down(runner);
    await runner.query('INSERT INTO project_settings (projectId, description) VALUES (?, ?)', [
      'legacy-project',
      '# Existing',
    ]);
    await migration.up(runner);
    expect(await settings.findByProjectId('legacy-project')).toMatchObject({
      description: '# Existing',
      revision: 0,
    });
    await migration.down(runner);
    expect(
      await runner.query('SELECT description FROM project_settings WHERE projectId = ?', [
        'legacy-project',
      ])
    ).toEqual([{ description: '# Existing' }]);
    await runner.release();
  });
});
