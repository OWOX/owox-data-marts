import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// Authoring a ROW-LEVEL calculated field.
//
// The level is DERIVED by the backend from the formula and surfaced nowhere in the UI, so nothing
// about this journey is supposed to look different from authoring a metric. That is exactly why it
// is measured in a real browser rather than asserted in happy-dom: the only way to know the
// row-level path is whole is to walk it — add the row, name it, author a formula with no aggregate
// call in Monaco, save, and then find the field in a report's column picker.
//
// Four "rendered but not visible" defects shipped on this branch with the unit suite green
// throughout. happy-dom has no layout, no clipping, no Monaco and no popover placement.
// ---------------------------------------------------------------------------

const ID_COLUMN = { name: 'id', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' };
const CLICKS_COLUMN = { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' };
const DAY_COLUMN = { name: 'day', type: 'DATE', mode: 'NULLABLE', status: 'CONNECTED' };

const FIELD_NAME = 'doubled_clicks';
const SESSION_KEY = 'session_key';
const SESSION_DAY = 'session_day';
/** No aggregate call anywhere in it — this is what makes the derived level `column`. */
const ROW_LEVEL_FORMULA = 'clicks * 2';
const CHIP = '.formula-field-chip';

interface SchemaFieldResponse {
  name: string;
  calculated?: { formula: string; level?: string };
}

interface ReportResponse {
  columnConfig?: string[];
  aggregationConfig?: { column: string; function: string }[] | null;
  dateTruncConfig?: { column: string; unit: string }[] | null;
}

test.describe('Data Setup - row-level calculated field', () => {
  let storageId: string;
  let dataMartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    storageId = storage.id;
    // Deliberately NOT joined to anything: the flat path refuses a row-level field on a blended report,
    // so the whole journey has to be walked on a Data Mart that owns all of its own fields.
    const dataMart = await apiHelpers.createDataMart(storageId, `Row-level DM ${Date.now()}`);
    dataMartId = dataMart.id;
    await apiHelpers.setDefinition(dataMartId);
    await apiHelpers.setSchema(dataMartId, [ID_COLUMN, CLICKS_COLUMN]);
  });

  /** The open formula popover, told apart by the diagnostics list only FormulaEditor renders. */
  function formulaPopover(page: Page): Locator {
    return page
      .locator('[data-slot="popover-content"]')
      .filter({ has: page.getByTestId('formula-diagnostics') });
  }

  /** The schema card's own Save. Last of the two on the page — the definition card's comes first. */
  function schemaSaveButton(page: Page): Locator {
    return page.getByRole('button', { name: 'Save', exact: true }).last();
  }

  async function readReport(page: Page, reportId: string): Promise<ReportResponse> {
    const res = await page.request.get(`/api/reports/${reportId}`);
    expect(res.ok()).toBeTruthy();
    return res.json() as Promise<ReportResponse>;
  }

  async function readSchemaFields(page: Page): Promise<SchemaFieldResponse[]> {
    const res = await page.request.get(`/api/data-marts/${dataMartId}`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { schema?: { fields?: SchemaFieldResponse[] } };
    return body.schema?.fields ?? [];
  }

  test('authors, saves and reloads a row-level calculated field (DSET-11)', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();
    await expect(page.getByText('clicks', { exact: true })).toBeVisible({ timeout: 15000 });

    // The bottom-row action, which is the one an analyst reaches after reading the table.
    await page.getByRole('button', { name: 'Add calculated field' }).last().click();

    // Name it. EditableText's popover holds a plain textarea; Enter commits it (minRows === 1).
    const namePlaceholder = page.getByText('Field name is required');
    await expect(namePlaceholder).toBeVisible();
    await namePlaceholder.click();
    const nameEditor = page.locator('[data-slot="popover-content"] textarea');
    await expect(nameEditor).toBeVisible();
    await nameEditor.fill(FIELD_NAME);
    await nameEditor.press('Enter');
    // Radix keeps the closing popover mounted through its exit animation, and its textarea still
    // holds the name — so wait for it to go before looking for the name on the row.
    await expect(nameEditor).toBeHidden();
    await expect(
      page.getByTestId(TESTIDS.datamartTabDataSetup).getByText(FIELD_NAME, { exact: true })
    ).toBeVisible();

    // …then the formula, in Monaco, in the band between Type and "Σ available".
    const formulaPlaceholder = page.getByText('Formula is required');
    await expect(formulaPlaceholder).toBeVisible();
    await formulaPlaceholder.click();

    const popover = formulaPopover(page);
    const editor = popover.locator('.monaco-editor').first();
    await expect(editor).toBeVisible({ timeout: 15000 });
    await editor.click();
    await page.keyboard.type(ROW_LEVEL_FORMULA);
    // The chip is the proof `clicks` RESOLVED to a real field rather than being left as bare SQL —
    // an unresolved name is what the local gate refuses on Apply.
    await expect(popover.locator(CHIP)).toHaveText('clicks', { timeout: 15000 });

    // Take focus off Monaco before pressing Apply, so a suggest list still open cannot sit over
    // the footer. Deliberately NOT Escape: Monaco only consumes that key while the list IS
    // showing, so on the runs where it is not, Escape reaches Radix and closes the whole popover —
    // which discards the formula and detaches the button this test is about to click.
    await popover.getByRole('heading').click();
    await expect(popover).toBeVisible();

    await popover.getByRole('button', { name: 'Apply' }).click();
    await expect(popover).toBeHidden();

    // The formula is on the row in AUTHORING form — the stored `{{ref}}` tag never reaches screen.
    const formulaCell = page.locator(`[title="${ROW_LEVEL_FORMULA}"]`).first();
    await expect(formulaCell).toBeVisible();
    expect(await formulaCell.textContent()).toBe(ROW_LEVEL_FORMULA);

    const save = schemaSaveButton(page);
    await expect(save).toBeEnabled();
    await save.click();

    // Saved, and saved CLEAN: the field-grouped error block is what a refused formula renders.
    await expect(save).toBeDisabled({ timeout: 15000 });
    await expect(page.getByText('Fix these calculated fields, then save again:')).toBeHidden();

    // The one thing on this journey the UI never shows, read back from the API instead: the
    // backend derived `column` from a formula with no aggregate call. A metric would read
    // `metric` here, and the whole point is that the two are told apart on the server.
    const fields = await readSchemaFields(page);
    const saved = fields.find(f => f.name === FIELD_NAME);
    expect(saved).toBeDefined();
    expect(saved?.calculated?.level).toBe('column');
    expect(saved?.calculated?.formula).toBe('{{ref field="clicks"}} * 2');

    // …and it survives a reload, drawn like any other calculated field: ƒ icon, no PK checkbox,
    // formula spanning the band between them — and its OWN allowed-aggregations
    // cell, which is where that band now stops.
    await page.reload();
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const reloadedCell = page.locator(`[title="${ROW_LEVEL_FORMULA}"]`).first();
    await expect(reloadedCell).toBeVisible({ timeout: 15000 });
    await expect(reloadedCell.locator(CHIP)).toHaveText('clicks');

    const row = page.getByRole('row').filter({ hasText: FIELD_NAME });
    await expect(row.getByRole('img', { name: 'Calculated field' })).toBeVisible();
    await expect(row.getByRole('checkbox')).toHaveCount(0);
    const allowedAggregations = row.getByLabel(`Aggregations for ${FIELD_NAME}`);
    await expect(allowedAggregations).toBeVisible();

    // Visible, not merely present: the band's cell is the one the four shipped defects were about,
    // and the cell beside it is now a control that has to be reachable, not just rendered.
    const box = await reloadedCell.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    const controlBox = await allowedAggregations.boundingBox();
    expect(controlBox?.width ?? 0).toBeGreaterThan(0);
    expect(controlBox?.height ?? 0).toBeGreaterThan(0);
  });

  test('offers a row-level calculated field in a report’s column picker (DSET-11)', async ({
    page,
    apiHelpers,
  }) => {
    test.setTimeout(120_000);

    await apiHelpers.setSchema(dataMartId, [
      ID_COLUMN,
      CLICKS_COLUMN,
      {
        name: FIELD_NAME,
        type: 'INTEGER',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: { formula: '{{ref field="clicks"}} * 2' },
      },
    ]);
    // The save derives the level; nothing above claims one. Assert it landed as `column` before
    // the picker is opened, so a failure below is about the picker and not about the fixture.
    const fields = await readSchemaFields(page);
    expect(fields.find(f => f.name === FIELD_NAME)?.calculated?.level).toBe('column');

    await apiHelpers.publish(dataMartId);
    const destTitle = `Row-level LS ${Date.now()}`;
    const dest = await apiHelpers.createDestination('LOOKER_STUDIO', destTitle);
    await apiHelpers.createReport(dataMartId, dest.id);

    await page.goto(`/ui/0/data-marts/${dataMartId}/reports`);
    const card = page.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();

    const sheet = page.getByTestId(TESTIDS.reportEditSheet);
    await expect(sheet).toBeVisible();

    const row = sheet.locator('[data-slot="native-field-row"]').filter({ hasText: FIELD_NAME });
    await expect(row).toBeVisible({ timeout: 15000 });

    const checkbox = row.getByRole('checkbox');
    // Not blocked: the broken-reference hint is what would put `aria-disabled` here, and this
    // formula resolves.
    await expect(checkbox).not.toHaveAttribute('aria-disabled', 'true');
    await expect(checkbox).not.toBeChecked();

    await checkbox.click();
    await expect(checkbox).toBeChecked();

    // The two controls live in one fixed-height slot at the row's right edge, and BOTH are offered
    // since the filter refusal's reason was disproved (it described a SELECT-list alias,
    // where a predicate's left-hand side is the formula itself). Asserted in a real browser as
    // well as in the unit suite because a control that is only painted off-screen is neither
    // offered nor suppressed.
    await expect(row.getByRole('button', { name: 'Add aggregation' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Add filter' })).toBeVisible();
  });

  test('aggregates a row-level calculated field with COUNT_DISTINCT (DSET-11)', async ({
    page,
    apiHelpers,
  }) => {
    test.setTimeout(120_000);

    await apiHelpers.setSchema(dataMartId, [
      ID_COLUMN,
      CLICKS_COLUMN,
      DAY_COLUMN,
      {
        name: SESSION_KEY,
        type: 'STRING',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: { formula: 'CAST({{ref field="clicks"}} AS STRING)' },
      },
      {
        // Declared DATE, and row-level: the shape the date bucket opened for, once the
        // five-dialect probe answered what had been deferred.
        name: SESSION_DAY,
        type: 'DATE',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: { formula: '{{ref field="day"}}' },
      },
    ]);
    const fields = await readSchemaFields(page);
    expect(fields.find(f => f.name === SESSION_KEY)?.calculated?.level).toBe('column');
    expect(fields.find(f => f.name === SESSION_DAY)?.calculated?.level).toBe('column');

    await apiHelpers.publish(dataMartId);
    const destTitle = `Row-level agg LS ${Date.now()}`;
    const dest = await apiHelpers.createDestination('LOOKER_STUDIO', destTitle);
    const report = await apiHelpers.createReport(dataMartId, dest.id);

    await page.goto(`/ui/0/data-marts/${dataMartId}/reports`);
    const card = page.getByTestId(TESTIDS.destCard).filter({ hasText: destTitle });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();

    const sheet = page.getByTestId(TESTIDS.reportEditSheet);
    await expect(sheet).toBeVisible();

    const keyRow = sheet.locator('[data-slot="native-field-row"]').filter({ hasText: SESSION_KEY });
    await expect(keyRow).toBeVisible({ timeout: 15000 });
    await keyRow.getByRole('checkbox').click();

    // The Σ icon is hover-revealed, so click it rather than assert on opacity — a click Playwright
    // can land is the only meaning of "offered" that matters.
    await keyRow.getByRole('button', { name: 'Add aggregation' }).click();
    const editor = page
      .locator('[data-slot="popover-content"]')
      .filter({ hasText: 'Aggregate by' });
    await expect(editor).toBeVisible();
    // A STRING field, so no bucket is in play here at all — and the menu is the STRING one.
    await expect(editor.getByLabel('Group by bucket')).toHaveCount(0);
    await editor.getByRole('checkbox', { name: 'COUNT_DISTINCT' }).click();
    await editor.getByRole('button', { name: 'Apply' }).click();
    await expect(editor).toBeHidden();

    // Applied: the icon now reads as active, which is the row's only sign the field carries one.
    await expect(keyRow.getByRole('button', { name: 'Manage aggregations' })).toBeVisible();

    // The DATE-declared row-level field: aggregation yes, and a bucket too.
    //
    // This assertion was the reverse until the five-dialect probe measured what each warehouse does
    // with a truncation over a formula. Nothing returns an empty column: every dialect either
    // buckets correctly or refuses loudly, so the control is offered and the declared type is the
    // contract, exactly as it is for an ordinary DATE column.
    const dayRow = sheet.locator('[data-slot="native-field-row"]').filter({ hasText: SESSION_DAY });
    await dayRow.getByRole('checkbox').click();
    await dayRow.getByRole('button', { name: 'Add aggregation' }).click();
    const dateEditor = page
      .locator('[data-slot="popover-content"]')
      .filter({ hasText: 'Aggregate by' });
    await expect(dateEditor.getByRole('checkbox', { name: 'MIN' })).toBeVisible();
    await expect(dateEditor.getByLabel('Group by bucket')).toBeVisible();
    await dateEditor.getByRole('button', { name: 'Cancel' }).click();
    await expect(dateEditor).toBeHidden();

    // An ordinary DATE column on the same report offers the same control — the two are now
    // deliberately alike, where this block used to read as a contrast. The STRING calculated field
    // above is what still carries the absence, and it does so for the declared type's sake rather
    // than for being calculated.
    const plainDayRow = sheet.locator('[data-slot="native-field-row"]').filter({ hasText: /^day/ });
    await plainDayRow.getByRole('button', { name: 'Add aggregation' }).click();
    const plainEditor = page
      .locator('[data-slot="popover-content"]')
      .filter({ hasText: 'Or aggregate by' });
    await expect(plainEditor.getByLabel('Group by bucket')).toBeVisible();
    await plainEditor.getByRole('button', { name: 'Cancel' }).click();

    // The save is the gate: this exact request used to come back 400
    // AGGREGATION_ON_CALCULATED_METRIC, and the report-update use case still runs the validator.
    // The sheet closing is that 200 — a refusal keeps it open and renders the message.
    const save = sheet.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(sheet).toBeHidden({ timeout: 15000 });

    const saved = await readReport(page, report.id);
    expect(saved.aggregationConfig).toEqual([{ column: SESSION_KEY, function: 'COUNT_DISTINCT' }]);
    // Aggregating it makes it a metric of the query, so it has to be projected BY NAME — an
    // aggregated report cannot ride on the implicit "all native columns" list, which leaves every
    // calculated field out.
    expect(saved.columnConfig).toContain(SESSION_KEY);
    // Nothing on this report is bucketed, and the DATE-declared formula above is why that
    // has to be asserted rather than assumed.
    expect(saved.dateTruncConfig ?? []).toEqual([]);

    // Reopened, the editor now believes in what it saved: the rule reads as live, not as the
    // "Column not found in schema" orphan a forced-empty allowed set used to render it as.
    await card.click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Aggregations', exact: true }).click();
    // The panel is drawn inline under the toolbar, not in a portal, so it needs a handle of its
    // own to be told apart from the field list around it.
    const panel = sheet.locator('[data-slot="aggregation-settings-panel"]');
    await expect(panel.getByTitle(SESSION_KEY)).toBeVisible();
    await expect(panel.getByText('aggregated by')).toBeVisible();
    await expect(panel.getByLabel('Column not found in schema')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /Edit disabled/ })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Edit aggregation' })).toHaveCount(1);
  });
});
