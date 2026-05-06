import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { ColumnPlan, PreviousImportedColumn } from '../../../dto/domain/column-plan.dto';
import { ConsumptionTrackingService } from '../../../services/consumption-tracking.service';
import {
  DataDestinationReportWriter,
  ReportWriteFinalizeMeta,
} from '../../interfaces/data-destination-report-writer.interface';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { isGoogleSheetsConfig } from '../../data-destination-config.guards';
import { GoogleSheetsConfig } from '../schemas/google-sheets-config.schema';
import { DateTime } from 'luxon';
import { sheets_v4 } from 'googleapis';
import { Report } from '../../../entities/report.entity';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { SheetHeaderFormatter } from './sheet-formatters/sheet-header-formatter';
import { SheetMetadataFormatter } from './sheet-formatters/sheet-metadata-formatter';
import { ColumnPlanBuilder } from './column-plan-builder';
import { GoogleSheetsApiAdapter } from '../adapters/google-sheets-api.adapter';
import { GoogleSheetsApiAdapterFactory } from '../adapters/google-sheets-api-adapter.factory';
import { SheetValuesFormatter } from './sheet-formatters/sheet-values-formatter';
import { SheetsReportRunEvent } from '../../../events/sheets-report-run.event';
import { OwoxEventDispatcher } from '../../../../common/event-dispatcher/owox-event-dispatcher';
import { GoogleSheetNotFound } from '../../../errors/google-sheet-not-found.error';
import { BusinessViolationException } from 'src/common/exceptions/business-violation.exception';
import { AppEditionConfig } from '../../../../common/config/app-edition-config.service';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import { buildDataMartUrl } from '../../../../common/helpers/data-mart-url.helper';

/**
 * Service for writing report data to Google Sheets
 * Handles preparation, writing, and finalization of report data in Google Sheets
 */
@Injectable({ scope: Scope.TRANSIENT })
export class GoogleSheetsReportWriter implements DataDestinationReportWriter {
  readonly type = DataDestinationType.GOOGLE_SHEETS;

  private readonly logger = new Logger(GoogleSheetsReportWriter.name);

  private report: Report;
  private adapter: GoogleSheetsApiAdapter;

  // State for current write operation
  private destination: GoogleSheetsConfig;
  private reportDataHeaders: ReportDataHeader[];
  private headersByName: Map<string, ReportDataHeader>;
  private columnPlan: ColumnPlan;
  private owoxColumnsMetadataId?: number;
  private spreadsheetTimeZone: string;
  private spreadsheetTitle: string;
  private sheetTitle: string;
  private dataMartTitle: string;
  private writtenRowsCount = 0;
  private availableRowsCount = 0;
  private availableColumnsCount = 0;

  constructor(
    private readonly headerFormatter: SheetHeaderFormatter,
    private readonly metadataFormatter: SheetMetadataFormatter,
    private readonly valuesFormatter: SheetValuesFormatter,
    private readonly columnPlanBuilder: ColumnPlanBuilder,
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    private readonly appEditionConfig: AppEditionConfig,
    private readonly publicOriginService: PublicOriginService,
    private readonly eventDispatcher: OwoxEventDispatcher
  ) {}

  /**
   * Prepares the Google Sheets document for writing report data.
   *
   * Performs a *diff-based* update of the imported column range: the writer
   * touches only the cells it owns and preserves any user-driven column
   * ordering already present in the sheet. The flow is:
   *
   *   1. Initialize the Sheets service and read sheet metadata.
   *   2. Read previous-run state in parallel:
   *      - row 1 values (current header layout, source of truth for ordering);
   *      - `OWOX_COLUMNS` developer metadata (the names + aliases ODM wrote
   *        last time).
   *   3. Build a `ColumnPlan` describing inserts/deletes to apply.
   *   4. Allocate grid rows/columns, then apply structural ops in a single
   *      `batchUpdate`. Sheets shifts A1 refs in user formulas automatically
   *      across these structural changes.
   *   5. Write headers + per-cell notes inside the imported rectangle only.
   *
   * Auto fill-down for user formulas in row 2 right of the imported range is
   * replayed in {@link finalize} via a `PASTE_FORMULA` `copyPaste` request,
   * after data rows have been written — Sheets shifts relative refs there too.
   */
  public async prepareToWriteReport(
    report: Report,
    reportDataDescription: ReportDataDescription
  ): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      await this.initializeService(report);

      this.reportDataHeaders = reportDataDescription.dataHeaders;
      if (this.reportDataHeaders.length === 0) {
        throw new Error(
          'Cannot prepare report: Data mart has no connected fields. Please ensure at least one field is connected.'
        );
      }
      this.headersByName = new Map(this.reportDataHeaders.map(h => [h.name, h]));

      const { existingHeaders, previousOwoxColumns } = await this.readSheetState();

      this.columnPlan = this.columnPlanBuilder.build(
        existingHeaders,
        previousOwoxColumns,
        this.reportDataHeaders
      );

      if (reportDataDescription.estimatedDataRowsCount) {
        await this.ensureRowsAvailable(reportDataDescription.estimatedDataRowsCount + 1); // +1 for headers
      }
      await this.prepareSheetColumns(this.columnPlan.finalImportedNames.length);
      await this.applyStructuralColumnOps();
      await this.writeHeaders();

      this.writtenRowsCount = 1;
    }, 'Preparing Google Sheets document for report');
  }

  /**
   * Writes a batch of report data to the sheet.
   *
   * Each row is reordered up-front to match the user-driven column layout
   * captured in `this.columnPlan.nameToFinalIndex`, then written into the
   * imported rectangle (`A{rowFrom}:{lastA1}{rowTo}`). Cells outside this
   * rectangle are not touched.
   *
   * @param reportDataBatch - Batch of data to write to the sheet
   * @throws Error if writing fails
   */
  public async writeReportDataBatch(reportDataBatch: ReportDataBatch): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const rows = reportDataBatch.dataRows;
      if (!rows.length) {
        return;
      }

      await this.ensureRowsAvailable(rows.length);

      const orderedRows = this.reorderRowsToFinalLayout(rows);
      const formattedRows = this.valuesFormatter.formatRowsValuesByName(
        orderedRows,
        this.columnPlan.finalImportedNames,
        this.headersByName,
        this.spreadsheetTimeZone
      );

      const rowFrom = this.writtenRowsCount + 1;
      const rowTo = rowFrom + rows.length - 1;
      const lastA1 = GoogleSheetsApiAdapter.colToA1(this.columnPlan.finalImportedNames.length);
      const range = `'${this.sheetTitle}'!A${rowFrom}:${lastA1}${rowTo}`;

      await this.adapter.updateValues(this.destination.spreadsheetId, range, formattedRows);

      this.writtenRowsCount += rows.length;
    }, 'Writing data batch to Google Sheets');
  }

  /**
   * Finalizes the report:
   *   - sets tab color and freezes the header row;
   *   - persists `OWOX_REPORT_META` (one per sheet) and `OWOX_COLUMNS`
   *     (the imported-range column list for next refresh);
   *   - replays user fill-down formulas across all freshly written data rows.
   */
  public async finalize(processingError?: Error, _meta?: ReportWriteFinalizeMeta): Promise<void> {
    await this.executeWithErrorHandling(async () => {
      if (this.writtenRowsCount > 0 && this.reportDataHeaders?.[0]) {
        const dataMart = this.report.dataMart;

        // Check if developer metadata already exists for this sheet
        const existingMetadata = await this.adapter.getDeveloperMetadata(
          this.destination.spreadsheetId,
          this.destination.sheetId
        );

        // Find ALL OWOX metadata entries for this sheet (to handle duplicates)
        const allOwoxMetadataForSheet = this.adapter.findAllOwoxReportMetadataForSheet(
          existingMetadata,
          this.destination.sheetId
        );

        // Get the first one for potential update (if no duplicates exist)
        const owoxMetadata =
          allOwoxMetadataForSheet.length > 0 ? allOwoxMetadataForSheet[0] : undefined;

        const requests: sheets_v4.Schema$Request[] = [
          this.metadataFormatter.createTabColorAndFreezeHeaderRequest(this.destination.sheetId),
        ];

        if (allOwoxMetadataForSheet.length > 1) {
          // Multiple metadata entries found - delete all duplicates first
          this.logger.warn(
            `Found ${allOwoxMetadataForSheet.length} duplicate metadata entries for report ${this.report.id}. ` +
              `Cleaning up duplicates before creating new entry.`
          );

          const duplicateIds = allOwoxMetadataForSheet
            .map(m => m.metadataId)
            .filter((id): id is number => id !== undefined && id !== null);

          if (duplicateIds.length > 0) {
            // Delete all duplicates and create new entry in the SAME batch operation (atomic)
            requests.push(...this.adapter.buildDeleteDeveloperMetadataRequests(duplicateIds));

            this.logger.debug(
              `Scheduling deletion of ${duplicateIds.length} duplicate metadata entries for report ${this.report.id}`
            );
          }

          requests.push(
            this.metadataFormatter.createDeveloperMetadataRequest(
              this.destination.sheetId,
              dataMart.projectId,
              dataMart.id,
              this.report.id
            )
          );
        } else if (owoxMetadata && owoxMetadata.metadataId) {
          // Single metadata entry exists - update it
          try {
            const existingReportId = JSON.parse(owoxMetadata.metadataValue ?? '{}').reportId;
            if (existingReportId !== this.report.id) {
              this.logger.warn(
                `Sheet ${this.destination.sheetId} already has metadata for report ${existingReportId}. ` +
                  `Overwriting with report ${this.report.id} as the new source of truth.`
              );
            }
          } catch {
            /* ignore parse error */
          }
          requests.push(
            this.metadataFormatter.updateDeveloperMetadataRequest(
              owoxMetadata.metadataId,
              dataMart.projectId,
              dataMart.id,
              this.report.id
            )
          );
        } else {
          // No metadata exists - create new
          requests.push(
            this.metadataFormatter.createDeveloperMetadataRequest(
              this.destination.sheetId,
              dataMart.projectId,
              dataMart.id,
              this.report.id
            )
          );
        }

        // Persist the imported-range column list (with aliases) for the
        // next refresh — the alias half lets the diff translate row-1
        // headers back to canonical names even when Output Schema sets
        // user-friendly aliases.
        const importedColumnsSnapshot = this.columnPlan.finalImportedNames.map(name => {
          const alias = this.headersByName.get(name)?.alias;
          return alias ? { name, alias } : { name };
        });
        if (this.owoxColumnsMetadataId !== undefined) {
          requests.push(
            this.metadataFormatter.updateOwoxColumnsMetadataRequest(
              this.owoxColumnsMetadataId,
              importedColumnsSnapshot
            )
          );
        } else {
          requests.push(
            this.metadataFormatter.createOwoxColumnsMetadataRequest(
              this.destination.sheetId,
              importedColumnsSnapshot
            )
          );
        }

        await this.adapter.batchUpdate(this.destination.spreadsheetId, requests);

        this.logger.debug(
          `Developer metadata written for report ${this.report.id} ` +
            `(project: ${dataMart.projectId}, datamart: ${dataMart.id})`
        );

        await this.replayFillDownFormulas();
      }
    }, 'Finalizing report with metadata and formatting');
    if (!processingError) {
      await this.consumptionTrackingService.registerSheetsReportRunConsumption(this.report, {
        googleSheetsDocumentTitle: this.spreadsheetTitle,
        googleSheetsListTitle: this.sheetTitle,
      });

      const dataMart = this.report.dataMart;
      await this.eventDispatcher.publishExternal(
        new SheetsReportRunEvent(
          dataMart.id,
          this.report.id,
          dataMart.projectId,
          this.report.createdById,
          'successfully'
        )
      );
    } else {
      const dataMart = this.report.dataMart;
      await this.eventDispatcher.publishExternal(
        new SheetsReportRunEvent(
          dataMart.id,
          this.report.id,
          dataMart.projectId,
          this.report.createdById,
          'unsuccessfully'
        )
      );
    }
  }

  /**
   * Initializes the Google Sheets service with credentials and finds the target sheet
   */
  private async initializeService(report: Report): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      if (!isGoogleSheetsConfig(report.destinationConfig)) {
        throw new Error('Invalid Google Sheets destination configuration provided');
      }
      this.destination = report.destinationConfig;

      const adapter = await this.adapterFactory.createFromDestination(report.dataDestination);

      if (!adapter) {
        throw new Error(
          'No authentication method available for Google Sheets: neither OAuth nor Service Account credentials found'
        );
      }
      this.adapter = adapter;

      const spreadsheet = await this.adapter
        .getSpreadsheet(this.destination.spreadsheetId)
        .catch(error => {
          throw new GoogleSheetNotFound(
            `Failed to access spreadsheet ${this.destination.spreadsheetId}: ${error.message}`
          );
        });
      const sheet = this.adapter.findSheetById(spreadsheet, this.destination.sheetId);

      if (!sheet) {
        throw new GoogleSheetNotFound(
          `Failed to find sheet ${this.destination.sheetId} in spreadsheet ${this.destination.spreadsheetId}`
        );
      }

      if (!spreadsheet.properties?.title) {
        throw new Error('Spreadsheet title is undefined');
      }

      if (!sheet.properties?.title) {
        throw new Error('Sheet title is undefined');
      }

      this.spreadsheetTitle = spreadsheet.properties?.title;
      this.sheetTitle = sheet.properties?.title;
      this.availableRowsCount = sheet.properties?.gridProperties?.rowCount ?? 0;
      this.availableColumnsCount = sheet.properties?.gridProperties?.columnCount ?? 0;
      this.spreadsheetTimeZone = spreadsheet.properties?.timeZone ?? 'UTC';
      this.dataMartTitle = report.dataMart.title;
      this.report = report;
    }, 'Initializing Google Sheets service and locating target sheet');
  }

  /**
   * Prepares the sheet columns by adding columns if needed
   */
  private async prepareSheetColumns(columnsCount: number): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const columnsToAllocate = columnsCount - this.availableColumnsCount;

      if (columnsToAllocate <= 0) {
        return;
      }

      await this.adapter.appendDimensionToSheet(
        this.destination.spreadsheetId,
        this.destination.sheetId,
        columnsToAllocate,
        'COLUMNS'
      );

      // Keep local tracking in sync so subsequent requests (header format
      // reset, etc.) operate on the correct column range.
      this.availableColumnsCount += columnsToAllocate;
    }, 'Adding columns to sheet as needed');
  }

  /**
   * Ensures there are enough rows in the sheet for the data to be written
   */
  private async ensureRowsAvailable(rowsToWrite: number): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const rowsNeeded = this.writtenRowsCount + rowsToWrite;
      const rowsToAllocate = rowsNeeded - this.availableRowsCount;

      if (rowsToAllocate <= 0) {
        return;
      }

      await this.adapter.appendDimensionToSheet(
        this.destination.spreadsheetId,
        this.destination.sheetId,
        rowsToAllocate,
        'ROWS'
      );

      this.availableRowsCount += rowsToAllocate;
    }, 'Adding rows to sheet to accommodate data');
  }

  /**
   * Reads the current state of the destination sheet that drives the diff:
   *   - row 1 values (current header layout — source of truth for ordering);
   *   - `OWOX_COLUMNS` developer metadata from the previous refresh.
   *
   * Both calls are issued in parallel since they are independent. Side-effect:
   * caches the metadata id of the existing `OWOX_COLUMNS` entry (if any) so
   * `finalize` can update instead of recreating it.
   */
  private async readSheetState(): Promise<{
    existingHeaders: string[];
    previousOwoxColumns: PreviousImportedColumn[] | null;
  }> {
    return this.executeWithErrorHandling(async () => {
      const [allMetadata, existingHeaders] = await Promise.all([
        this.adapter.getDeveloperMetadata(this.destination.spreadsheetId, this.destination.sheetId),
        this.adapter.getRowValues(this.destination.spreadsheetId, this.sheetTitle, 1),
      ]);

      const owoxColumnsEntries = this.adapter.findOwoxColumnsMetadataForSheet(
        allMetadata,
        this.destination.sheetId
      );

      let previousOwoxColumns: PreviousImportedColumn[] | null = null;
      if (owoxColumnsEntries.length > 0) {
        const first = owoxColumnsEntries[0];
        this.owoxColumnsMetadataId = first.metadataId ?? undefined;
        previousOwoxColumns = this.parseOwoxColumnsMetadata(first.metadataValue ?? null);
      }

      return { existingHeaders, previousOwoxColumns };
    }, 'Reading sheet state for column diff');
  }

  /**
   * Parses the persisted `OWOX_COLUMNS` metadata payload, accepting both the
   * current schema (`[{name, alias?}, …]`) and the legacy schema (a plain
   * array of strings) for backward compatibility with sheets exported before
   * alias-aware mapping landed. Returns `null` on malformed input — the
   * caller treats that as "no prior state" and falls back to first-run path.
   */
  private parseOwoxColumnsMetadata(rawValue: string | null): PreviousImportedColumn[] | null {
    if (!rawValue) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      this.logger.warn(
        `Failed to parse OWOX_COLUMNS metadata on sheet ${this.destination.sheetId}; treating sheet as fresh.`
      );
      return null;
    }
    if (!Array.isArray(parsed)) {
      this.logger.warn(
        `OWOX_COLUMNS metadata on sheet ${this.destination.sheetId} is not an array; treating sheet as fresh.`
      );
      return null;
    }

    const result: PreviousImportedColumn[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        // Legacy format: plain name string (no alias was tracked).
        result.push(new PreviousImportedColumn(item));
        continue;
      }
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { name?: unknown }).name === 'string'
      ) {
        const obj = item as { name: string; alias?: unknown };
        const alias = typeof obj.alias === 'string' ? obj.alias : undefined;
        result.push(new PreviousImportedColumn(obj.name, alias));
        continue;
      }
      this.logger.warn(
        `OWOX_COLUMNS metadata on sheet ${this.destination.sheetId} contains an unrecognized entry; treating sheet as fresh.`
      );
      return null;
    }
    return result;
  }

  /**
   * Applies structural column ops (`insertDimension`/`deleteDimension`) from
   * the column plan in a single `batchUpdate`. No-op on first run or when the
   * plan reports no changes.
   */
  private async applyStructuralColumnOps(): Promise<void> {
    if (this.columnPlan.ops.length === 0) {
      return;
    }
    return this.executeWithErrorHandling(async () => {
      const requests = this.columnPlan.ops.map(op =>
        op.kind === 'delete'
          ? this.adapter.buildDeleteColumnRequest(this.destination.sheetId, op.atIndex)
          : this.adapter.buildInsertColumnRequest(this.destination.sheetId, op.atIndex)
      );
      await this.adapter.batchUpdate(this.destination.spreadsheetId, requests);

      const inserts = this.columnPlan.ops.filter(op => op.kind === 'insert').length;
      const deletes = this.columnPlan.ops.length - inserts;
      this.availableColumnsCount += inserts - deletes;
    }, 'Applying structural column changes');
  }

  /**
   * Writes header values + per-cell notes inside the imported rectangle, and
   * resets/applies header formatting bounded to the same width. Format reset
   * is **not** propagated to columns past the imported range so user content
   * outside it keeps its styling.
   */
  private async writeHeaders(): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const { spreadsheetId, sheetId } = this.destination;
      const finalNames = this.columnPlan.finalImportedNames;

      // Build the row 1 array in final layout order. Each cell shows
      // `alias || name`, looked up by name through the plan's index map.
      const headerRow: string[] = new Array(finalNames.length);
      for (const header of this.reportDataHeaders) {
        const idx = this.columnPlan.nameToFinalIndex.get(header.name);
        if (idx === undefined) {
          // Defensive: should be unreachable given how the plan is built.
          throw new Error(`ColumnPlan.nameToFinalIndex is missing entry for column ${header.name}`);
        }
        headerRow[idx] = header.alias || header.name;
      }

      const lastA1 = GoogleSheetsApiAdapter.colToA1(finalNames.length);
      await this.adapter.updateValues(spreadsheetId, `'${this.sheetTitle}'!A1:${lastA1}1`, [
        headerRow,
      ]);

      // Per-column note: description first, ODM info second. Every imported
      // column carries the ODM provenance block so users can see ownership at
      // a glance on any header — not just A1.
      const dateNow = DateTime.now().setZone(this.spreadsheetTimeZone);
      const dateNowFormatted = `${dateNow.toFormat('yyyy LLL d, HH:mm:ss')} ${dateNow.zoneName}`;
      const dataMart = this.report.dataMart;
      const isCommunityEdition = !this.appEditionConfig.isEnterpriseEdition();
      const publicOrigin = this.publicOriginService.getPublicOrigin();
      const dataMartUrl = buildDataMartUrl(
        publicOrigin,
        dataMart.projectId,
        dataMart.id,
        '/data-setup'
      );

      const noteRequests = this.reportDataHeaders.map(header => {
        const idx = this.columnPlan.nameToFinalIndex.get(header.name)!;
        const note = this.metadataFormatter.buildImportedColumnNote(
          header.description,
          this.dataMartTitle,
          dataMartUrl,
          dateNowFormatted,
          isCommunityEdition
        );
        return this.metadataFormatter.createNoteRequest(sheetId, note, 0, idx);
      });

      await this.adapter.batchUpdate(spreadsheetId, [
        this.headerFormatter.createHeaderClearFormatRequest(sheetId, finalNames.length),
        this.headerFormatter.createHeaderFormatRequest(sheetId, finalNames.length),
        ...noteRequests,
      ]);
    }, 'Writing and formatting column headers');
  }

  /**
   * Reorders each row's fields so they line up with the user-driven column
   * layout in the destination sheet. Inputs arrive in `reportDataHeaders`
   * order (i.e. SQL order); we move each value into the slot dictated by
   * `columnPlan.nameToFinalIndex`.
   */
  private reorderRowsToFinalLayout(rows: unknown[][]): unknown[][] {
    const finalNames = this.columnPlan.finalImportedNames;
    return rows.map(srcRow => {
      const out: unknown[] = new Array(finalNames.length);
      for (let i = 0; i < this.reportDataHeaders.length; i++) {
        const finalIdx = this.columnPlan.nameToFinalIndex.get(this.reportDataHeaders[i].name)!;
        out[finalIdx] = srcRow[i];
      }
      return out;
    });
  }

  /**
   * Replays user fill-down formulas in row 2 across rows `[3..writtenRowsCount]`
   * for every column right of the imported range.
   *
   * Implemented as a single `copyPaste` request with `pasteType:
   * 'PASTE_FORMULA'` — Google Sheets shifts relative A1 refs the same way
   * drag-fill does. Cells in row 2 that hold static values (not formulas)
   * are left untouched by `PASTE_FORMULA`.
   *
   * NOTE: writing the formula string directly via `values.update` /
   * `values.batchUpdate` would NOT shift refs — that API records formula
   * strings verbatim, regardless of destination row.
   */
  private async replayFillDownFormulas(): Promise<void> {
    const sourceCol = this.columnPlan.lastImportedColIndex + 1; // 0-based
    const lastCol = this.availableColumnsCount; // 0-exclusive end
    const sourceRow = 1; // 0-based row 2
    const destStartRow = 2; // 0-based row 3
    const destEndRow = this.writtenRowsCount; // 0-exclusive end

    // Skip when there's nothing to fill (no rows below row 2, or no user
    // columns right of imported range).
    if (sourceCol >= lastCol || destStartRow >= destEndRow) {
      return;
    }
    return this.executeWithErrorHandling(async () => {
      const request = this.adapter.buildCopyPasteRequest(
        this.destination.sheetId,
        { startRow: sourceRow, endRow: sourceRow + 1, startCol: sourceCol, endCol: lastCol },
        { startRow: destStartRow, endRow: destEndRow, startCol: sourceCol, endCol: lastCol },
        'PASTE_FORMULA'
      );
      await this.adapter.batchUpdate(this.destination.spreadsheetId, [request]);
    }, 'Replaying user fill-down formulas');
  }

  /**
   * Executes an operation with consistent error handling and logging
   */
  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      this.logger.debug(`${operationName} started`);
      const result = await operation();
      this.logger.debug(`${operationName} completed`);
      return result;
    } catch (error) {
      if (error instanceof BusinessViolationException) {
        this.logger.warn(`${operationName} warning: ${error.message}`);
      } else {
        this.logger.error(`${operationName} failed: ${error.message}`, error.stack);
      }
      throw error;
    }
  }
}
