import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { ColumnPlan, PreviousImportedColumn } from '../../../dto/domain/column-plan.dto';
import {
  DataDestinationReportWriter,
  ReportWriteFinalizeMeta,
  ReportWriteFinalizeResult,
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
  /**
   * Metadata IDs of any extra `OWOX_COLUMNS` entries beyond the canonical
   * one (`owoxColumnsMetadataId`). Populated by {@link readSheetState};
   * scheduled for atomic deletion in the finalize batchUpdate. Empty in the
   * common case.
   */
  private duplicateOwoxColumnsMetadataIds: number[] = [];
  /**
   * Tracks whether the destructive part of the refresh — column
   * insert/delete and header rewrite — has already been issued to the
   * Sheets API. We defer those operations from `prepareToWriteReport`
   * to the first successful `writeReportDataBatch` so that any failure
   * upstream of the first batch (reader connection lost, SQL execution
   * error, etc.) leaves the destination sheet exactly as the user last
   * saw it. See {@link applyDeferredSheetMutations}.
   */
  private structuralOpsApplied = false;
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
   *
   * **No sheet mutations happen here.** Column insert/delete and header
   * rewrite are deferred to the first {@link writeReportDataBatch} call —
   * see {@link applyDeferredSheetMutations}. The rationale is fault
   * isolation: if the reader fails before producing the first batch
   * (transient warehouse error, malformed SQL caught at execution, etc.),
   * the destination sheet remains exactly as the user last saw it. We
   * accept partial-data corruption mid-stream (some rows new, some old)
   * because the alternative — destructive structural ops before data is
   * known to be available — produces the much worse "headers updated but
   * data gone" state that triggered this design.
   *
   * Auto fill-down for user formulas in row 2 right of the imported range is
   * replayed in {@link finalize} via a `PASTE_FORMULA` `copyPaste` request,
   * after data rows have been written — Sheets shifts relative refs there too.
   *
   * ### Concurrency
   *
   * There is a TOCTOU window between {@link readSheetState} and
   * {@link applyDeferredSheetMutations}: in the order of hundreds of
   * milliseconds in the common case but can stretch longer when the reader
   * is slow to produce its first batch. If a user manually reorders columns
   * in row 1 inside this window, the structural ops can act on the wrong
   * indices and write data into the wrong cells for that one refresh. We
   * accept this trade-off because (a) the window is small in the happy
   * path, (b) Sheets API does not expose optimistic-concurrency primitives
   * like `If-Match`/`revisionId` on `batchUpdate`, and (c) the next refresh
   * re-reads the layout and self-corrects — `OWOX_COLUMNS` is persisted in
   * the same `batchUpdate` that runs at the end of this flow, so prior-state
   * inconsistency cannot leak across refreshes. The risk is documented here
   * rather than guarded.
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

      // C5 — Reject duplicate column names from the SQL output up-front. The
      // diff maps by name, so two columns sharing a name would collide in
      // `headersByName` and `nameToFinalIndex`, silently dropping one column's
      // values into another column on every refresh. We surface this as a
      // business violation rather than logging it.
      const duplicates = this.findDuplicateColumnNames(this.reportDataHeaders);
      if (duplicates.length > 0) {
        throw new BusinessViolationException(
          `Duplicate column names in SQL output: ${duplicates.join(', ')}. ` +
            `Rename one of the conflicting columns or apply an alias.`
        );
      }

      this.headersByName = new Map(this.reportDataHeaders.map(h => [h.name, h]));

      const { existingHeaders, previousOwoxColumns } = await this.readSheetState();

      this.columnPlan = this.columnPlanBuilder.build(
        existingHeaders,
        previousOwoxColumns,
        this.reportDataHeaders
      );

      // C4 — Structured telemetry log for rollout observability. One line per
      // refresh; lets us monitor first-run vs diff-run distribution, op
      // counts, and tie any anomalies back to a specific data mart without a
      // feature flag.
      this.logger.log(
        `gs-export.column-plan ` +
          `dataMartId=${report.dataMart.id} ` +
          `reportId=${report.id} ` +
          `sheetId=${this.destination.sheetId} ` +
          `isFirstRun=${this.columnPlan.isFirstRun} ` +
          `prevColumns=${previousOwoxColumns?.length ?? 0} ` +
          `desiredColumns=${this.reportDataHeaders.length} ` +
          `inserts=${this.columnPlan.ops.filter(op => op.kind === 'insert').length} ` +
          `deletes=${this.columnPlan.ops.filter(op => op.kind === 'delete').length}`
      );

      // Pre-allocate row capacity. `appendDimension('ROWS')` only grows the
      // grid at the bottom — it does not mutate the user's imported content
      // or column structure, so it is safe to do here even though the
      // destructive operations are deferred.
      if (reportDataDescription.estimatedDataRowsCount) {
        await this.ensureRowsAvailable(reportDataDescription.estimatedDataRowsCount + 1); // +1 for headers
      }
    }, 'Preparing Google Sheets document for report');
  }

  /**
   * Issues the destructive part of the refresh — grow column count,
   * apply column insert/delete, write headers, pre-clear the imported
   * rectangle — as a one-shot block. Invoked lazily from the first
   * {@link writeReportDataBatch} call so that any failure before data
   * starts flowing leaves the sheet untouched. Subsequent batch calls
   * return immediately because the `structuralOpsApplied` flag is set.
   *
   * The pre-clear step (`values.clear` on `A2..lastImportedColA1:availableRows`)
   * is what gives the writer its "ODM owns the imported rectangle" contract:
   * after it runs, every cell in the imported rectangle is empty, and the
   * subsequent `writeReportDataBatch` calls fill only the cells SQL produced
   * a value for. Cells where SQL returned NULL stay empty (no manual user
   * edit bleeds across refresh); cells beyond the last written row stay
   * empty too (so shrunk datasets don't leave stale trailing data).
   *
   * If the reader produces zero batches but completes without error,
   * {@link finalize} calls this method itself to bring the sheet layout
   * up to date and wipe stale data even on an empty result set.
   */
  private async applyDeferredSheetMutations(): Promise<void> {
    if (this.structuralOpsApplied) {
      return;
    }
    await this.prepareSheetColumns(this.columnPlan.finalImportedNames.length);
    await this.applyStructuralColumnOps();
    await this.writeHeaders();
    await this.preClearImportedRectangle();
    this.writtenRowsCount = 1;
    this.structuralOpsApplied = true;
  }

  /**
   * Clears values in the imported rectangle's data area
   * (`A2..lastImportedColA1:availableRowsCount`) so that subsequent
   * `writeReportDataBatch` calls operate on a clean slate. Empties cells in
   * imported columns only — user content right of the imported range stays
   * untouched (DoD A of the column-preservation refactor).
   *
   * No-op when the imported rectangle has zero columns or zero data rows in
   * the current grid (e.g. a brand-new sheet trimmed to one row).
   */
  private async preClearImportedRectangle(): Promise<void> {
    // Defensive: should be unreachable given `prepareToWriteReport` rejects
    // empty data headers up-front. Kept as a silent no-op so that any
    // future invariant break here surfaces as a missing pre-clear rather
    // than a malformed Sheets API range.
    if (this.columnPlan.finalImportedNames.length === 0) {
      return;
    }
    const rowFrom = 2; // row 1 holds the headers we just wrote
    const rowTo = this.availableRowsCount;
    if (rowFrom > rowTo) {
      return;
    }
    const lastA1 = GoogleSheetsApiAdapter.colToA1(this.columnPlan.finalImportedNames.length);
    const range = `'${this.sheetTitle}'!A${rowFrom}:${lastA1}${rowTo}`;
    return this.executeWithErrorHandling(
      () => this.adapter.clearValuesInRange(this.destination.spreadsheetId, range),
      'Pre-clearing imported rectangle before writing new data'
    );
  }

  /**
   * Writes a batch of report data to the sheet.
   *
   * Each row is reordered up-front to match the user-driven column layout
   * captured in `this.columnPlan.nameToFinalIndex`, then written into the
   * imported rectangle (`A{rowFrom}:{lastA1}{rowTo}`). Cells outside this
   * rectangle are not touched.
   *
   * The first call triggers {@link applyDeferredSheetMutations}, which
   * pre-clears the imported rectangle. As a consequence, nullish values in
   * the batch payload land on cells that are already empty — the writer
   * does not need to normalize NULL into "" to overwrite stale content.
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

      // Lazily commit the structural changes and headers now that we have
      // data to write. If the very first batch ever reaches us, this is the
      // earliest point at which we know the reader has succeeded enough to
      // produce something — before this, the sheet stays intact.
      await this.applyDeferredSheetMutations();

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
   *   - if the reader completed successfully but produced zero batches,
   *     applies the deferred structural ops + headers + pre-clear so the
   *     layout is refreshed and stale data is wiped even on an empty
   *     result set;
   *   - sets tab color and freezes the header row;
   *   - persists `OWOX_REPORT_META` (one per sheet) and `OWOX_COLUMNS`
   *     (the imported-range column list for next refresh);
   *   - replays user fill-down formulas across all freshly written data rows.
   *
   * When `processingError` is set we **skip** the deferred-mutation
   * fallback: the upstream pipeline failed before producing meaningful
   * data, and the design contract is that such failures must leave the
   * sheet exactly as the user last saw it.
   */
  public async finalize(
    processingError?: Error,
    _meta?: ReportWriteFinalizeMeta
  ): Promise<ReportWriteFinalizeResult | void> {
    await this.executeWithErrorHandling(async () => {
      // Zero-batch happy path: the reader finished cleanly but had nothing
      // to write. Bring the sheet layout up to date so column changes do
      // not stall indefinitely on legitimately empty data marts. The
      // pre-clear inside `applyDeferredSheetMutations` also wipes stale
      // data rows from any previous refresh.
      if (!processingError && !this.structuralOpsApplied && this.reportDataHeaders?.length > 0) {
        await this.applyDeferredSheetMutations();
      }

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
          } catch (err) {
            this.logger.debug(
              `Failed to parse existing OWOX_REPORT_META on sheet ${this.destination.sheetId}; ` +
                `treating as missing reportId. Cause: ${(err as Error).message}`
            );
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

        // H2 — atomically delete any extra OWOX_COLUMNS entries detected at
        // read time, in the same batch as the canonical update. Mirrors the
        // OWOX_REPORT_META dedup branch above.
        if (this.duplicateOwoxColumnsMetadataIds.length > 0) {
          requests.push(
            ...this.adapter.buildDeleteDeveloperMetadataRequests(
              this.duplicateOwoxColumnsMetadataIds
            )
          );
          this.logger.debug(
            `Scheduling deletion of ${this.duplicateOwoxColumnsMetadataIds.length} duplicate ` +
              `OWOX_COLUMNS entries on sheet ${this.destination.sheetId}.`
          );
        }

        // C1 + C2 + H4 — append fill-down `copyPaste` requests to the same
        // batch so either both metadata persist AND fill-down replay land,
        // or neither lands. Gates fill-down per-column on the presence of a
        // formula in row 2 (no fill-down for static values / blank cells).
        const fillDownRequests = await this.buildFillDownRequests();
        if (fillDownRequests.length > 0) {
          requests.push(...fillDownRequests);
        }

        await this.adapter.batchUpdate(this.destination.spreadsheetId, requests);

        this.logger.debug(
          `Developer metadata written for report ${this.report.id} ` +
            `(project: ${dataMart.projectId}, datamart: ${dataMart.id}); ` +
            `fillDownRequests=${fillDownRequests.length}`
        );
      }
    }, 'Finalizing report with metadata and formatting');
    if (!processingError) {
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
      return {
        consumption: {
          googleSheets: {
            googleSheetsDocumentTitle: this.spreadsheetTitle,
            googleSheetsListTitle: this.sheetTitle,
          },
        },
      };
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
    // Assign before any async work — `finalize(error)` reads `this.report.dataMart` on the failure path.
    this.report = report;
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

        // H2 — capture extra OWOX_COLUMNS entries for atomic cleanup in
        // finalize. Mirrors the OWOX_REPORT_META dedup pattern below.
        if (owoxColumnsEntries.length > 1) {
          this.duplicateOwoxColumnsMetadataIds = owoxColumnsEntries
            .slice(1)
            .map(m => m.metadataId)
            .filter((id): id is number => typeof id === 'number');
          this.logger.warn(
            `Found ${owoxColumnsEntries.length} OWOX_COLUMNS entries on sheet ` +
              `${this.destination.sheetId} (dataMartId=${this.report.dataMart.id}). ` +
              `Keeping the first and scheduling the rest for deletion in finalize.`
          );
        }
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
  /**
   * Returns the list of column names that appear more than once in the
   * input headers, with each duplicate listed only once. Empty array when
   * all names are unique.
   */
  private findDuplicateColumnNames(headers: ReportDataHeader[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const h of headers) {
      if (seen.has(h.name)) {
        duplicates.add(h.name);
      } else {
        seen.add(h.name);
      }
    }
    return [...duplicates];
  }

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
   * Builds fill-down `copyPaste` requests for user formulas sitting in row 2
   * right of the imported range. The writer applies these requests as part
   * of the finalize batchUpdate so that fill-down and metadata persist
   * atomically — if either part fails, the whole batch is rejected and
   * `OWOX_COLUMNS` is not advanced past a half-applied state.
   *
   * Strategy:
   *   * Read row 2 of the user-content area (right of the imported range)
   *     with `valueRenderOption: 'FORMULA'`.
   *   * For each cell whose value starts with `=`, emit one narrow
   *     `copyPaste` (source: row 2 of that column; destination: rows
   *     3..writtenRowsCount of the same column; `pasteType: 'PASTE_FORMULA'`).
   *   * Columns that hold a static value or are empty produce no request,
   *     so the writer never overwrites a user lookup table in rows 3..N.
   *
   * Returns an empty array when there is nothing to fill (no user columns
   * to the right, no data rows under the headers, or row 2 has no
   * formulas).
   *
   * NOTE: writing the formula string directly via `values.update` /
   * `values.batchUpdate` would NOT shift refs — that API records formula
   * strings verbatim, regardless of destination row.
   */
  private async buildFillDownRequests(): Promise<sheets_v4.Schema$Request[]> {
    const firstUserCol1 = this.columnPlan.lastImportedColIndex + 2; // 1-based first col right of imported
    const lastCol1 = this.availableColumnsCount; // 1-based, inclusive
    const dataRowFrom = 3; // 1-based; rows 3..writtenRowsCount get the fill-down
    const dataRowTo = this.writtenRowsCount; // 1-based, inclusive

    // Nothing to fill: no user columns, or no rows under row 2.
    if (firstUserCol1 > lastCol1 || dataRowFrom > dataRowTo) {
      return [];
    }

    const formulas = await this.executeWithErrorHandling(
      () =>
        this.adapter.getRowFormulas(
          this.destination.spreadsheetId,
          this.sheetTitle,
          2,
          firstUserCol1,
          lastCol1
        ),
      'Reading row-2 formulas for fill-down'
    );

    const requests: sheets_v4.Schema$Request[] = [];
    formulas.forEach((cell, i) => {
      if (!cell.startsWith('=')) {
        return; // gate: skip static values and empties so we don't overwrite user content
      }
      const col0Based = firstUserCol1 - 1 + i;
      requests.push(
        this.adapter.buildCopyPasteRequest(
          this.destination.sheetId,
          {
            startRow: 1, // 0-based row 2
            endRow: 2, // exclusive
            startCol: col0Based,
            endCol: col0Based + 1,
          },
          {
            startRow: dataRowFrom - 1, // 0-based row 3
            endRow: dataRowTo, // exclusive end of writtenRowsCount
            startCol: col0Based,
            endCol: col0Based + 1,
          },
          'PASTE_FORMULA'
        )
      );
    });
    return requests;
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
