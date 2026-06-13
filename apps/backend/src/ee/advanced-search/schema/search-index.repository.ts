import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryResult } from 'typeorm';

export interface SearchIndexRow {
  dataMartId: string;
  projectId: string;
  embedding: Buffer | null;
  dim: number | null;
  docHash: string;
  model: string;
  updatedAt: Date;
}

type RawRow = {
  data_mart_id: string;
  project_id: string;
  embedding: Buffer | null;
  dim: number | null;
  doc_hash: string;
  model: string;
  updated_at: string | Date;
};

const TABLE = 'data_mart_search_index';

function toIso(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function parseDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  const normalized = v.includes('T') || v.endsWith('Z') ? v : v.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

@Injectable()
export class SearchIndexRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async upsert(row: SearchIndexRow): Promise<void> {
    const type = this.dataSource.options.type;
    const updatedAt = toIso(row.updatedAt);

    if (type === 'better-sqlite3') {
      await this.dataSource.query(
        `INSERT INTO ${TABLE}
           (data_mart_id, project_id, embedding, dim, doc_hash, model, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(data_mart_id) DO UPDATE SET
           project_id = excluded.project_id,
           embedding  = excluded.embedding,
           dim        = excluded.dim,
           doc_hash   = excluded.doc_hash,
           model      = excluded.model,
           updated_at = excluded.updated_at`,
        [row.dataMartId, row.projectId, row.embedding, row.dim, row.docHash, row.model, updatedAt]
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO ${TABLE}
           (data_mart_id, project_id, embedding, dim, doc_hash, model, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           project_id = VALUES(project_id),
           embedding  = VALUES(embedding),
           dim        = VALUES(dim),
           doc_hash   = VALUES(doc_hash),
           model      = VALUES(model),
           updated_at = VALUES(updated_at)`,
        [row.dataMartId, row.projectId, row.embedding, row.dim, row.docHash, row.model, updatedAt]
      );
    }
  }

  async listByProject(
    projectId: string
  ): Promise<{ dataMartId: string; embedding: Buffer | null }[]> {
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT data_mart_id, embedding FROM ${TABLE} WHERE project_id = ?`,
      [projectId]
    );
    return rows.map(r => ({ dataMartId: r.data_mart_id, embedding: r.embedding }));
  }

  async listHashes(projectId?: string): Promise<Map<string, string>> {
    const rows: Pick<RawRow, 'data_mart_id' | 'doc_hash'>[] = projectId
      ? await this.dataSource.query(
          `SELECT data_mart_id, doc_hash FROM ${TABLE} WHERE project_id = ?`,
          [projectId]
        )
      : await this.dataSource.query(`SELECT data_mart_id, doc_hash FROM ${TABLE}`);

    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.data_mart_id, r.doc_hash);
    }
    return map;
  }

  async deleteAllExcept(liveIds: Set<string>): Promise<number> {
    const qr = this.dataSource.createQueryRunner();
    try {
      if (liveIds.size === 0) {
        const result: QueryResult = await qr.query(`DELETE FROM ${TABLE}`, [], true);
        return result.affected ?? 0;
      }

      const placeholders = Array.from({ length: liveIds.size }, () => '?').join(', ');
      const result: QueryResult = await qr.query(
        `DELETE FROM ${TABLE} WHERE data_mart_id NOT IN (${placeholders})`,
        Array.from(liveIds),
        true
      );
      return result.affected ?? 0;
    } finally {
      await qr.release();
    }
  }

  async maxUpdatedAt(projectId?: string): Promise<string | null> {
    const rows: { max_ts: string | null }[] = projectId
      ? await this.dataSource.query(
          `SELECT MAX(updated_at) AS max_ts FROM ${TABLE} WHERE project_id = ?`,
          [projectId]
        )
      : await this.dataSource.query(`SELECT MAX(updated_at) AS max_ts FROM ${TABLE}`);

    const raw = rows[0]?.max_ts ?? null;
    if (raw === null) return null;
    return parseDate(raw).toISOString();
  }
}
