import { Test, TestingModule } from '@nestjs/testing';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

function tableDefinition(fqn: string): DataMartDefinition {
  return {
    type: 'table',
    fullyQualifiedName: fqn,
  } as unknown as DataMartDefinition;
}

function sqlDefinition(query: string): DataMartDefinition {
  return {
    type: 'sql',
    sqlQuery: query,
  } as unknown as DataMartDefinition;
}

describe('BigQueryQueryBuilder', () => {
  let builder: BigQueryQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BigQueryQueryBuilder],
    }).compile();

    builder = module.get(BigQueryQueryBuilder);
  });

  describe('buildQuery (without columns option)', () => {
    it('returns SELECT * for a table definition', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'));
      expect(sql).toBe('SELECT * FROM `proj`.`dataset`.`tbl`');
    });

    it('returns user SQL untouched for a SQL definition', async () => {
      const sql = await builder.buildQuery(sqlDefinition('SELECT a, b FROM t'));
      expect(sql).toBe('SELECT a, b FROM t');
    });
  });

  describe('buildQuery with columns filter', () => {
    it('projects only specified columns on a table definition', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['campaign_name', 'date_column'],
      });
      expect(sql).toBe('SELECT `campaign_name`, `date_column` FROM `proj`.`dataset`.`tbl`');
    });

    it('escapes nested RECORD paths as backtick-separated parts', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['address.city', 'user_id'],
      });
      expect(sql).toBe('SELECT `address`.`city`, `user_id` FROM `proj`.`dataset`.`tbl`');
    });

    it('wraps SQL definition queries when columns are provided', async () => {
      const sql = await builder.buildQuery(sqlDefinition('SELECT a, b, c FROM t;'), {
        columns: ['a', 'c'],
      });
      expect(sql).toBe('SELECT `a`, `c` FROM (SELECT a, b, c FROM t)');
    });

    it('ignores empty columns list and falls back to SELECT *', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: [],
      });
      expect(sql).toBe('SELECT * FROM `proj`.`dataset`.`tbl`');
    });
  });
});
