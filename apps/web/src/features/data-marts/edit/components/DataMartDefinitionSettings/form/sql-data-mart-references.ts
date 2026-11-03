import { scanSql, type SqlToken } from '../../DataMartSchemaSettings/calculated/sql-token-scanner';
import type { DataMartReference } from '../../../../../../shared/components/DescriptionEditor/data-mart-mentions';

const NON_CODE_KINDS: ReadonlySet<SqlToken['kind']> = new Set([
  'string',
  'comment',
  'quotedIdentifier',
]);

/**
 * The Data Mart reference being typed right before the caret: an `@` that starts a word, outside
 * string literals, comments and quoted identifiers, followed by search text on the same line.
 */
export function sqlReferenceAtCursor(prefix: string): { query: string; start: number } | null {
  const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
  const match = /(?:^|[\s(,])@([^@[\]()\n'"`;,]*)$/.exec(line);
  if (!match) return null;
  const start = prefix.lastIndexOf('@');
  const insideLiteral = scanSql(prefix).some(
    token => NON_CODE_KINDS.has(token.kind) && token.start <= start && start < token.end
  );
  if (insideLiteral) return null;
  return { query: match[1].trim(), start };
}

/**
 * A reference to another Data Mart as the SQL editor stores it: `[Title](dm:<id>)`. The backend
 * resolves it by id and refreshes the title on save, so the title is only a label.
 */
export function sqlDataMartReference(reference: Pick<DataMartReference, 'id' | 'title'>): string {
  const title = reference.title
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
  return `[${title}](dm:${reference.id.toLowerCase()})`;
}

/** How many Data Mart references a SQL query holds, for analytics. */
export function countSqlDataMartReferences(sql: string): number {
  return sql.match(/\]\(dm:[0-9a-fA-F-]{36}\)/g)?.length ?? 0;
}
