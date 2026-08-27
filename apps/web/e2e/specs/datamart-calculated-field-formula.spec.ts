import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

// ---------------------------------------------------------------------------
// DSET-09: the calculated-field formula editor's autocomplete.
//
// Measured in a real browser on purpose. Every previous defect in this editor was of the kind
// "rendered, but not visible" — a clipped widget, a clipped action row, a name jammed against its
// type — and the unit suite was green through all of them, because happy-dom has no layout, no
// transform and no overflow. What the analyst can READ is only observable here.
// ---------------------------------------------------------------------------

/** The deepest joined Data Mart's title, which autocomplete right-aligns on the row. */
const JOINED_SOURCE_TITLE = 'Organizations Billing Accounts Daily Snapshot';
/** Three joins deep, so the offered name is the alias path in full. */
const DEEP_FIELD_NAME = 'users.organizations.billing_accounts.subscription_plan_identifier';
const METRIC_FORMULA = 'SUM(clicks)';

const ID_COLUMN = { name: 'id', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' };

const SUGGEST_WIDGET = '.formula-editor-overflow-widgets .suggest-widget.visible';

test.describe('Data Setup - Calculated field formula autocomplete', () => {
  let dataMartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    const dataMart = await apiHelpers.createDataMart(storage.id, `Formula DM ${Date.now()}`);
    dataMartId = dataMart.id;
    await apiHelpers.setDefinition(dataMartId);
    await apiHelpers.setSchema(dataMartId, [
      ID_COLUMN,
      { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
      {
        name: 'roas',
        type: 'FLOAT',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
    ]);

    // A chain, not a fan: each Data Mart joins the next, so the third one's fields are offered
    // under `users.organizations.billing_accounts.…` rather than a single-segment alias.
    const chain = [
      { title: 'Users', alias: 'users', fields: [ID_COLUMN] },
      { title: 'Organizations', alias: 'organizations', fields: [ID_COLUMN] },
      {
        title: JOINED_SOURCE_TITLE,
        alias: 'billing_accounts',
        fields: [
          ID_COLUMN,
          {
            name: 'subscription_plan_identifier',
            type: 'STRING',
            mode: 'NULLABLE',
            status: 'CONNECTED',
          },
        ],
      },
    ];

    let sourceId = dataMartId;
    for (const link of chain) {
      const joined = await apiHelpers.createDataMart(storage.id, link.title);
      await apiHelpers.setDefinition(joined.id);
      await apiHelpers.setSchema(joined.id, link.fields);
      // Only a PUBLISHED target reaches the blendable schema, which is where autocomplete's
      // joined entries come from.
      await apiHelpers.publish(joined.id);
      await apiHelpers.createRelationship(sourceId, joined.id, link.alias);
      sourceId = joined.id;
    }
  });

  /**
   * The open formula popover, told apart from the SQL definition editor's own popovers by the
   * diagnostics list only FormulaEditor renders.
   */
  function formulaPopover(page: Page): Locator {
    return page
      .locator('[data-slot="popover-content"]')
      .filter({ has: page.getByTestId('formula-diagnostics') });
  }

  /** Opens the metric's formula popover and types `users`, so the joined paths are offered. */
  async function openAutocomplete(page: Page): Promise<Locator> {
    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    // The formula cell of the `roas` row — the whole cell carries the formula as its title.
    const formulaCell = page.locator(`[title="${METRIC_FORMULA}"]`).first();
    await expect(formulaCell).toBeVisible({ timeout: 15000 });
    await formulaCell.click();

    const formulaEditor = formulaPopover(page).locator('.monaco-editor').first();
    await expect(formulaEditor).toBeVisible({ timeout: 15000 });
    await formulaEditor.click();
    // Monaco attaches its input asynchronously, so its node is on screen and clickable before it
    // can receive a keystroke. Characters typed into that gap are dropped, and nothing retriggers
    // the suggest widget once they are — the wait below then times out on a symptom two steps from
    // its cause. Waiting on the editor's own input makes the failure say what actually broke.
    //
    // Two selectors because Monaco 0.56 ships two input implementations and renders exactly one:
    // `div.native-edit-context` where the browser has the EditContext API (Chromium, so this is
    // the one that runs here) and `textarea.inputarea` otherwise. Both carry the editor's tabindex
    // and its focus tracker; the native path's other textarea is `.ime-text-area`, so neither
    // selector can match twice.
    await expect(
      formulaPopover(page).locator('div.native-edit-context, textarea.inputarea')
    ).toBeFocused({ timeout: 15000 });
    await page.keyboard.type('users');

    const suggestWidget = page.locator(SUGGEST_WIDGET);
    await expect(suggestWidget).toBeVisible({ timeout: 15000 });
    return suggestWidget;
  }

  test('shows a deep joined path in full in the suggest list (DSET-09)', async ({ page }) => {
    test.setTimeout(90_000);

    const suggestWidget = await openAutocomplete(page);

    const deepRow = suggestWidget.locator('.monaco-list-row', { hasText: DEEP_FIELD_NAME });
    await expect(deepRow).toBeVisible({ timeout: 15000 });

    // The measurement that matters: the box the name is drawn in shows the whole name. When the
    // widget is too narrow the name is ellipsised, and the box's content is wider than the box.
    const label = await deepRow.evaluate(row => {
      const nameBox = row.querySelector('.monaco-icon-label-container');
      const details = row.querySelector('.details-label');
      return {
        name: row.querySelector('.label-name')?.textContent ?? '',
        nameVisibleWidth: nameBox?.clientWidth ?? 0,
        nameContentWidth: nameBox?.scrollWidth ?? 0,
        detailsText: details?.textContent ?? '',
      };
    });

    expect(label.name).toBe(DEEP_FIELD_NAME);
    expect(label.nameVisibleWidth).toBeGreaterThan(0);
    expect(label.nameVisibleWidth).toBeGreaterThanOrEqual(label.nameContentWidth);
    // The row still names its Data Mart — the width came from growing the widget, not from
    // dropping the column that made the name long in the first place.
    expect(label.detailsText).toBe(JOINED_SOURCE_TITLE);

    // …and the growth stays on screen and within its cap.
    const viewport = page.viewportSize();
    const widget = await suggestWidget.boundingBox();
    expect(viewport).not.toBeNull();
    expect(widget).not.toBeNull();
    const { width: viewportWidth } = viewport ?? { width: 0 };
    const { x, width } = widget ?? { x: 0, width: 0 };
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(viewportWidth);
    // 720px or 90% of the window, plus the 1px borders the box model adds on each side.
    expect(width).toBeLessThanOrEqual(Math.min(720, viewportWidth * 0.9) + 2);
  });

  test('keeps a width the analyst dragged, and does not re-grow it (DSET-09)', async ({ page }) => {
    test.setTimeout(90_000);

    const suggestWidget = await openAutocomplete(page);
    const grown = await suggestWidget.boundingBox();
    expect(grown).not.toBeNull();
    const { x, y, width, height } = grown ?? { x: 0, y: 0, width: 0, height: 0 };

    // The right-hand sash, which is the widget's own resize handle.
    const dragBy = -180;
    await page.mouse.move(x + width - 1, y + height / 2);
    await page.mouse.down();
    await page.mouse.move(x + width - 1 + dragBy, y + height / 2, { steps: 10 });
    await page.mouse.up();

    const dragged = await suggestWidget.boundingBox();
    expect(dragged?.width ?? 0).toBeLessThan(width - 100);

    // Re-filtering re-opens the list at the size Monaco persisted for the drag. Nothing here may
    // measure over that and widen it back.
    await page.keyboard.type('.');
    await expect(suggestWidget).toBeVisible();
    const afterTyping = await suggestWidget.boundingBox();
    expect(afterTyping?.width ?? 0).toBeCloseTo(dragged?.width ?? 0, 0);
  });

  test('inserts a suggestion clicked with the mouse, editor still open (DSET-09)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const suggestWidget = await openAutocomplete(page);
    const deepRow = suggestWidget.locator('.monaco-list-row', { hasText: DEEP_FIELD_NAME });
    await expect(deepRow).toBeVisible({ timeout: 15000 });
    await deepRow.click();

    // The list is hosted outside the popover's DOM, so a press on it must not read as a click
    // away: that would close the editor and throw the edit away.
    const popover = formulaPopover(page);
    await expect(popover).toBeVisible();
    await expect(popover.locator('.view-lines')).toContainText(DEEP_FIELD_NAME);
  });
});
