import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { AddCredentialDecisionMapping1794528000000 } from './1794528000000-add-credential-decision-mapping';

type Row = {
  id: string;
  definitionSource: string;
  definitionId: string;
  aiModelMappings: string | null;
  aiModelMappingModes: string | null;
  aiModelMappingSources: string | null;
};

describe('AddCredentialDecisionMapping migration', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new AddCredentialDecisionMapping1794528000000();

  const insert = (
    id: string,
    source: string,
    definitionId: string,
    mappings: unknown,
    modes: unknown,
    sources: unknown
  ) =>
    runner.query(
      `INSERT INTO credential
       (id, definitionSource, definitionId, aiModelMappings, aiModelMappingModes, aiModelMappingSources)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        source,
        definitionId,
        mappings === null ? null : JSON.stringify(mappings),
        modes === null ? null : JSON.stringify(modes),
        sources === null ? null : JSON.stringify(sources),
      ]
    );

  const load = async (id: string) => {
    const [row] = (await runner.query('SELECT * FROM credential WHERE id = ?', [id])) as Row[];
    const parse = (value: string | null) => (value === null ? null : JSON.parse(value));
    return {
      mappings: parse(row.aiModelMappings),
      modes: parse(row.aiModelMappingModes),
      sources: parse(row.aiModelMappingSources),
    };
  };

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [] });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.query(
      `CREATE TABLE credential (
        id varchar PRIMARY KEY, definitionSource varchar, definitionId varchar,
        aiModelMappings text, aiModelMappingModes text, aiModelMappingSources text)`
    );
  });

  afterEach(async () => {
    await runner.release();
    await dataSource.destroy();
  });

  it('adds a recommended decision mapping to built-in OpenAI, Gemini and Anthropic AI Credentials', async () => {
    const cases: Array<[string, string]> = [
      ['openai', 'gpt-6-luna'],
      ['gemini', 'gemini-decision-1'],
      ['anthropic', 'claude-haiku-4-5-20251001'],
    ];
    for (const [definitionId] of cases) {
      await insert(
        definitionId,
        'builtin',
        definitionId,
        { fast: 'f', reasoning: 'r' },
        { fast: 'recommended', reasoning: 'custom' },
        { fast: 'catalog', reasoning: 'manual' }
      );
    }
    await insert('null-sources', 'builtin', 'openai', { fast: 'f' }, { fast: 'recommended' }, null);

    await migration.up(runner);

    for (const [definitionId, model] of cases) {
      expect(await load(definitionId)).toEqual({
        mappings: { fast: 'f', reasoning: 'r', decision: model },
        modes: { fast: 'recommended', reasoning: 'custom', decision: 'recommended' },
        sources: { fast: 'catalog', reasoning: 'manual', decision: 'catalog' },
      });
    }
    expect((await load('null-sources')).sources).toEqual({ decision: 'catalog' });
  });

  it('leaves other rows unchanged', async () => {
    await insert('override', 'builtin', 'openai', { decision: 'x' }, { decision: 'custom' }, null);
    await insert('empty', 'builtin', 'openai', null, null, null);
    await insert('empty-objects', 'builtin', 'gemini', {}, {}, null);
    await insert('openrouter', 'builtin', 'openrouter', { fast: 'f' }, { fast: 'custom' }, null);
    await insert('external', 'external', 'openai', { fast: 'f' }, { fast: 'custom' }, null);

    await migration.up(runner);

    expect(await load('override')).toEqual({
      mappings: { decision: 'x' },
      modes: { decision: 'custom' },
      sources: null,
    });
    expect(await load('empty')).toEqual({ mappings: null, modes: null, sources: null });
    expect(await load('empty-objects')).toEqual({ mappings: {}, modes: {}, sources: null });
    expect((await load('openrouter')).mappings).toEqual({ fast: 'f' });
    expect((await load('external')).mappings).toEqual({ fast: 'f' });
  });

  it('down removes only recommended decision entries', async () => {
    await insert(
      'recommended',
      'builtin',
      'openai',
      { fast: 'f', decision: 'gpt-6-luna' },
      { fast: 'custom', decision: 'recommended' },
      { fast: 'manual', decision: 'catalog' }
    );
    await insert(
      'override',
      'builtin',
      'anthropic',
      { decision: 'x' },
      { decision: 'custom' },
      { decision: 'manual' }
    );

    await migration.down(runner);

    expect(await load('recommended')).toEqual({
      mappings: { fast: 'f' },
      modes: { fast: 'custom' },
      sources: { fast: 'manual' },
    });
    expect(await load('override')).toEqual({
      mappings: { decision: 'x' },
      modes: { decision: 'custom' },
      sources: { decision: 'manual' },
    });
  });
});
