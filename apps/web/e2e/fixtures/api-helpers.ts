import { type Page, expect } from '@playwright/test';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

/**
 * Deletes all rows from all non-system tables in the SQLite DB.
 * Prevents data leakage between spec files that causes flaky tests.
 */
export function resetDatabase(): void {
  const dbPath = process.env.SQLITE_DB_PATH;
  if (!dbPath) return; // skip if no DB path (e.g. :memory:)

  const absPath = resolve(dbPath);
  const esmRequire = createRequire(import.meta.url);
  const Database = esmRequire('better-sqlite3');

  let db;
  try {
    db = new Database(absPath);
  } catch {
    return; // DB file doesn't exist yet
  }

  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
      )
      .all() as { name: string }[];

    db.pragma('foreign_keys = OFF');
    for (const { name } of tables) {
      db.prepare(`DELETE FROM "${name}"`).run();
    }
    db.pragma('foreign_keys = ON');
  } finally {
    db.close();
  }
}

/**
 * Seeds storage config and a dummy credential directly in the SQLite DB.
 * Required for CONNECTOR definitions — the update-storage API validates
 * against real cloud services, so we bypass it by writing to the DB file.
 */
function seedStorageConfig(storageId: string): void {
  const dbPath = process.env.SQLITE_DB_PATH;
  if (!dbPath) throw new Error('SQLITE_DB_PATH not set — cannot seed storage config');

  const absPath = resolve(dbPath);
  const esmRequire = createRequire(import.meta.url);
  const Database = esmRequire('better-sqlite3');
  const db = new Database(absPath);

  try {
    const credentialId = randomUUID();
    db.prepare(
      `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
       VALUES (?, '0', 'google_service_account', '{"type":"test-credentials"}', datetime('now'), datetime('now'))`
    ).run(credentialId);
    db.prepare(`UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`).run(
      JSON.stringify({ projectId: 'test-project', dataset: 'test_dataset' }),
      credentialId,
      storageId
    );
  } finally {
    db.close();
  }
}

export class ApiHelpers {
  constructor(private page: Page) {}

  /**
   * Seeds storage config and credential directly in the SQLite DB.
   * Call after createStorage() when the storage will be used for CONNECTOR definitions.
   */
  seedStorageConfig(storageId: string): void {
    seedStorageConfig(storageId);
  }

  async createStorage(type = 'GOOGLE_BIGQUERY'): Promise<{ id: string }> {
    const res = await this.page.request.post('/api/data-storages', {
      data: { type },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async createDataMart(storageId: string, title?: string): Promise<{ id: string }> {
    const res = await this.page.request.post('/api/data-marts', {
      data: { title: title ?? `E2E DataMart ${Date.now()}`, storageId },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async setDefinition(dataMartId: string, sqlQuery = 'SELECT 1 AS test_column'): Promise<void> {
    const res = await this.page.request.put(`/api/data-marts/${dataMartId}/definition`, {
      data: { definitionType: 'SQL', definition: { sqlQuery } },
    });
    expect(res.ok()).toBeTruthy();
  }

  async publish(dataMartId: string): Promise<void> {
    const res = await this.page.request.put(`/api/data-marts/${dataMartId}/publish`);
    expect(res.ok()).toBeTruthy();
  }

  /**
   * Composite: creates a storage, data mart, sets definition, and publishes.
   * Mirrors the backend setupPublishedDataMart pattern.
   */
  async createPublishedDataMart(
    title?: string
  ): Promise<{ storage: { id: string }; datamart: { id: string } }> {
    const storage = await this.createStorage();
    const datamart = await this.createDataMart(storage.id, title);
    await this.setDefinition(datamart.id);
    await this.publish(datamart.id);
    return { storage, datamart };
  }

  /**
   * Sets a Bank of Canada connector definition on a datamart via the
   * PUT /api/data-marts/{id}/definition endpoint.
   */
  async setConnectorDefinition(dataMartId: string): Promise<void> {
    const res = await this.page.request.put(`/api/data-marts/${dataMartId}/definition`, {
      data: {
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name: 'BankOfCanada',
              configuration: [{ ReimportLookbackWindow: 2 }],
              node: 'observations/group',
              fields: ['date', 'label', 'rate'],
            },
            storage: {
              fullyQualifiedName: 'test_dataset.bank_of_canada_rates',
            },
          },
        },
      },
    });
    expect(res.ok()).toBeTruthy();
  }

  /**
   * Composite: creates a storage, data mart, sets a connector definition,
   * and publishes. Returns a published connector-type datamart suitable
   * for manual run tests.
   */
  async createPublishedConnectorDataMart(
    title?: string
  ): Promise<{ storage: { id: string }; datamart: { id: string } }> {
    const storage = await this.createStorage();
    // Seed config + credentials directly in DB — the update-storage API
    // validates against real cloud services which is not possible in tests.
    seedStorageConfig(storage.id);
    const datamart = await this.createDataMart(storage.id, title);
    await this.setConnectorDefinition(datamart.id);
    await this.publish(datamart.id);
    return { storage, datamart };
  }

  /**
   * Returns the credential payload required by the backend for the given
   * destination type. EMAIL, MS_TEAMS and GOOGLE_CHAT all use the
   * email-credentials schema; LOOKER_STUDIO has its own; GOOGLE_SHEETS
   * requires OAuth/service-account and is left undefined here.
   */
  private getCredentialsForType(type: string): Record<string, unknown> | undefined {
    switch (type) {
      case 'LOOKER_STUDIO':
        return { type: 'looker-studio-credentials' };
      case 'EMAIL':
        return { type: 'email-credentials', to: ['test@example.com'] };
      case 'MS_TEAMS':
        return { type: 'email-credentials', to: ['test-teams@example.com'] };
      case 'GOOGLE_CHAT':
        return { type: 'email-credentials', to: ['test-chat@example.com'] };
      default:
        return undefined;
    }
  }

  async createDestination(type = 'LOOKER_STUDIO', title?: string): Promise<{ id: string }> {
    const res = await this.page.request.post('/api/data-destinations', {
      data: {
        title: title ?? `E2E Destination ${Date.now()}`,
        type,
        credentials: this.getCredentialsForType(type),
      },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async deleteDestination(id: string): Promise<void> {
    const res = await this.page.request.delete(`/api/data-destinations/${id}`);
    expect(res.ok()).toBeTruthy();
  }

  async createReport(
    dataMartId: string,
    dataDestinationId: string,
    title?: string
  ): Promise<{ id: string }> {
    const res = await this.page.request.post('/api/reports', {
      data: {
        title: title ?? `E2E Report ${Date.now()}`,
        dataMartId,
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
      },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async createTrigger(dataMartId: string): Promise<{ id: string }> {
    const res = await this.page.request.post(`/api/data-marts/${dataMartId}/scheduled-triggers`, {
      data: {
        type: 'CONNECTOR_RUN',
        cronExpression: '0 9 * * *',
        timeZone: 'UTC',
        isActive: true,
      },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  /**
   * Composite: creates a destination and a report linked to a data mart.
   * Mirrors the backend setupReportPrerequisites pattern.
   */
  async setupDestinationWithReport(
    dataMartId: string
  ): Promise<{ destinationId: string; reportId: string }> {
    const dest = await this.createDestination();
    const report = await this.createReport(dataMartId, dest.id);
    return { destinationId: dest.id, reportId: report.id };
  }
}
