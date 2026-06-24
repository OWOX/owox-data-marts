import { Repository } from 'typeorm';
import { Context } from '../../entities/context.entity';

export async function loadContextsByEntityIds<TJoin extends { contextId: string }>(
  joinRepo: Repository<TJoin>,
  contextRepo: Repository<Context>,
  joinAlias: string,
  ids: string[],
  fkField: keyof TJoin & string
): Promise<Map<string, { name: string; content: string }[]>> {
  const joins = await joinRepo
    .createQueryBuilder(joinAlias)
    .where(`${joinAlias}.${fkField} IN (:...ids)`, { ids })
    .getMany();

  if (joins.length === 0) return new Map();

  const contextIds = [...new Set(joins.map(j => j.contextId))];
  const contexts = await contextRepo
    .createQueryBuilder('ctx')
    .where('ctx.id IN (:...ids)', { ids: contextIds })
    .andWhere('ctx.deletedAt IS NULL')
    .getMany();

  const contextMap = new Map(contexts.map(c => [c.id, c]));

  const result = new Map<string, { name: string; content: string }[]>();
  for (const join of joins) {
    const entityId = join[fkField] as string;
    const ctx = contextMap.get(join.contextId);
    if (!ctx) continue;
    const entry = { name: ctx.name ?? '', content: ctx.description ?? '' };
    const existing = result.get(entityId) ?? [];
    existing.push(entry);
    result.set(entityId, existing);
  }
  return result;
}
