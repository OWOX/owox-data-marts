import 'reflect-metadata';
import { join } from 'path';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Report } from '../entities/report.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { DataMart } from '../entities/data-mart.entity';
import { RoleScope } from '../enums/role-scope.enum';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { DataMartService } from '../services/data-mart.service';
import { applyDataMartVisibilityFilter } from './apply-data-mart-visibility-filter';

type Dialect = 'better-sqlite3' | 'mysql';

async function createDialectDataSource(type: Dialect): Promise<DataSource> {
  const dataSource = new DataSource({
    type,
    database: type === 'better-sqlite3' ? ':memory:' : 'owox_review',
    host: type === 'mysql' ? '127.0.0.1' : undefined,
    username: type === 'mysql' ? 'owox_review' : undefined,
    password: type === 'mysql' ? 'owox_review' : undefined,
    entities: [join(process.cwd(), 'src/**/*.entity.ts')],
    synchronize: false,
    logging: false,
  });

  await dataSource.buildMetadatas();
  return dataSource;
}

function applyViewerVisibility<T extends object>(qb: SelectQueryBuilder<T>) {
  return applyDataMartVisibilityFilter(qb, {
    dataMartAlias: 'dataMart',
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
    roleScope: RoleScope.SELECTED_CONTEXTS,
  });
}

function buildProjectReportQuery(dataSource: DataSource, ownerFilter?: OwnerFilter) {
  const qb = dataSource
    .getRepository(Report)
    .createQueryBuilder('r')
    .innerJoin('r.dataMart', 'dataMart')
    .where('dataMart.projectId = :projectId', { projectId: 'project-1' })
    .andWhere('dataMart.deletedAt IS NULL');

  applyViewerVisibility(qb);

  if (ownerFilter === OwnerFilter.HAS_OWNERS) {
    qb.andWhere('EXISTS (SELECT 1 FROM report_owners o WHERE o.report_id = r.id)');
  } else if (ownerFilter === OwnerFilter.NO_OWNERS) {
    qb.andWhere('NOT EXISTS (SELECT 1 FROM report_owners o WHERE o.report_id = r.id)');
  }

  return qb
    .select('r.id', 'id')
    .orderBy('r.createdAt', 'DESC')
    .addOrderBy('r.id', 'DESC')
    .limit(100)
    .offset(0);
}

function buildProjectRunQuery(dataSource: DataSource) {
  const qb = dataSource
    .getRepository(DataMartRun)
    .createQueryBuilder('run')
    .innerJoin('run.dataMart', 'dataMart')
    .where('dataMart.projectId = :projectId', { projectId: 'project-1' })
    .andWhere('dataMart.deletedAt IS NULL')
    .select('run.id', 'id')
    .orderBy('run.createdAt', 'DESC')
    .addOrderBy('run.id', 'DESC')
    .limit(100)
    .offset(0);

  return applyViewerVisibility(qb);
}

function buildProjectScheduledTriggerQuery(dataSource: DataSource) {
  const qb = dataSource
    .getRepository(DataMartScheduledTrigger)
    .createQueryBuilder('scheduledTrigger')
    .innerJoin('scheduledTrigger.dataMart', 'dataMart')
    .where('dataMart.projectId = :projectId', { projectId: 'project-1' })
    .andWhere('dataMart.deletedAt IS NULL')
    .select('scheduledTrigger.id', 'id')
    .orderBy('scheduledTrigger.createdAt', 'DESC')
    .addOrderBy('scheduledTrigger.id', 'DESC')
    .limit(100)
    .offset(0);

  return applyViewerVisibility(qb);
}

function buildProjectInsightTemplateQuery(dataSource: DataSource) {
  const qb = dataSource
    .getRepository(InsightTemplate)
    .createQueryBuilder('insightTemplate')
    .innerJoin('insightTemplate.dataMart', 'dataMart')
    .where('dataMart.projectId = :projectId', { projectId: 'project-1' })
    .andWhere('dataMart.deletedAt IS NULL')
    .select('insightTemplate.id', 'id')
    .orderBy('insightTemplate.modifiedAt', 'DESC')
    .addOrderBy('insightTemplate.id', 'DESC')
    .limit(100)
    .offset(0);

  return applyViewerVisibility(qb);
}

function buildCanvasDataMartQuery(dataSource: DataSource) {
  const service = new DataMartService(
    dataSource.getRepository(DataMart),
    null as never,
    null as never,
    null as never
  );
  const queryBuilderService = service as unknown as {
    buildCanvasVisibleDataMartsQuery: (
      projectId: string,
      storageId: string,
      options: { userId: string; roles: string[]; roleScope: RoleScope }
    ) => SelectQueryBuilder<DataMart>;
  };

  return queryBuilderService
    .buildCanvasVisibleDataMartsQuery('project-1', 'storage-1', {
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
    })
    .select(['dm.id', 'dm.title', 'dm.status', 'dm.description', 'dm.schema'])
    .orderBy('dm.title', 'ASC')
    .addOrderBy('dm.id', 'ASC')
    .take(1_000)
    .skip(0);
}

describe('project Data Mart list SQL dialects', () => {
  const unsupportedDialectPatterns = [
    /\bILIKE\b/i,
    /::/,
    /\bDATE_TRUNC\b/i,
    /\bjson_extract\b/i,
    /\bJSON_EXTRACT\b/,
  ];

  it.each<Dialect>(['better-sqlite3', 'mysql'])(
    'generates portable project list SQL for %s',
    async dialect => {
      const dataSource = await createDialectDataSource(dialect);
      const queries = [
        buildProjectReportQuery(dataSource, OwnerFilter.HAS_OWNERS),
        buildProjectReportQuery(dataSource, OwnerFilter.NO_OWNERS),
        buildProjectRunQuery(dataSource),
        buildProjectScheduledTriggerQuery(dataSource),
        buildProjectInsightTemplateQuery(dataSource),
        buildCanvasDataMartQuery(dataSource),
      ];

      for (const qb of queries) {
        const sql = qb.getSql();
        expect(sql).toContain('data_mart_contexts');
        for (const pattern of unsupportedDialectPatterns) {
          expect(sql).not.toMatch(pattern);
        }
      }

      expect(buildProjectInsightTemplateQuery(dataSource).getSql()).not.toContain('sourceEntities');
      const canvasSql = buildCanvasDataMartQuery(dataSource).getSql();
      expect(canvasSql).toContain('storageId');
      expect(canvasSql).toContain('data_mart_contexts');
    }
  );
});
