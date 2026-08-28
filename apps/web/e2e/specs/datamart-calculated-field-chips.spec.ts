import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';
import { findFormulaCell } from '../helpers/formula-cell';

// ---------------------------------------------------------------------------
// DSET-10: a resolved field reference behaves as an ATOMIC CHIP.
//
// Every assertion here is about something happy-dom does not have: a caret, a selection, a
// clipboard, an undo stack and paint. The unit specs beside the two chip modules pin the decisions
// those modules make; only this file can say whether Monaco then does what they decided.
//
// Each test drives the caret with real keys and reads the RESULT OUT OF THE TEXT, because the
// caret's offset is not observable from the page: an arrow key that failed to step over a chip
// leaves the next character it types in the middle of the field name.
// ---------------------------------------------------------------------------

const METRIC_FORMULA = 'SUM(clicks)';
/** A metric reading a JOINED Data Mart, whose alias says nothing about which one. */
const JOINED_FORMULA = 'SUM(orders.amount)';
/** The joined Data Mart's own title — what a chip has to name, since `orders` is only its alias. */
const JOINED_TITLE = 'Orders';
/** Wider than the band the formula occupies, so it has to wrap onto more lines. */
const LONG_FORMULA =
  'SUM(clicks) / NULLIF(SUM(impressions), 0) + SUM(orders.amount) / NULLIF(SUM(clicks), 0)';
const CHIP = '.formula-field-chip';
const SUGGEST_WIDGET = '.formula-editor-overflow-widgets .suggest-widget.visible';
/**
 * Monaco's content hover, in the same body-level host the suggest list uses. `:not(.hidden)` picks
 * the one that is SHOWING: the host also holds the glyph-margin hover, which stays hidden here.
 */
const HOVER_WIDGET = '.formula-editor-overflow-widgets .monaco-hover:not(.hidden)';

/**
 * The modifier for a chord MONACO resolves — undo, redo, select-all. `Control` here whatever the
 * host OS is, and NOT Playwright's `ControlOrMeta`.
 *
 * `devices['Desktop Chrome']` emulates a **Windows** user agent, and that is what Monaco reads to
 * decide `CtrlCmd` means Control (`platform.js` sets `_isMacintosh` from the UA). `ControlOrMeta`
 * follows the machine the test runs on instead, so on a Mac it sends Meta and Monaco resolves
 * nothing at all — measured: with Meta, none of undo, select-all or comment-line fired, while the
 * editor reported text focus throughout.
 *
 * A chord the BROWSER resolves is the other way round and must use `ControlOrMeta`: copy, cut and
 * paste are deliberately left unbound by Monaco in a browser build (`clipboard.js`: `kbOpts` is
 * `isNative ? … : undefined`, "browsers do that for us"), so the accelerator is the host's.
 */
const MONACO_MOD = 'Control';

const ID_COLUMN = { name: 'id', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' };

test.describe('Data Setup - Calculated field chips', () => {
  let dataMartId: string;

  test.beforeEach(async ({ apiHelpers }) => {
    const storage = await apiHelpers.createStorage();
    const dataMart = await apiHelpers.createDataMart(storage.id, `Chip DM ${Date.now()}`);
    dataMartId = dataMart.id;
    await apiHelpers.setDefinition(dataMartId);

    // Published and joined BEFORE the schema is written: a formula naming `orders.amount` is
    // validated on save, and a path that resolves to nothing is refused there.
    const joined = await apiHelpers.createDataMart(storage.id, JOINED_TITLE);
    await apiHelpers.setDefinition(joined.id);
    await apiHelpers.setSchema(joined.id, [
      ID_COLUMN,
      { name: 'amount', type: 'FLOAT', mode: 'NULLABLE', status: 'CONNECTED' },
    ]);
    await apiHelpers.publish(joined.id);
    await apiHelpers.createRelationship(dataMartId, joined.id, 'orders');

    await apiHelpers.setSchema(dataMartId, [
      ID_COLUMN,
      { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
      { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
      {
        name: 'roas',
        type: 'FLOAT',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
      {
        name: 'joined_roas',
        type: 'FLOAT',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: {
          formula: 'SUM({{ref path="orders" field="amount"}})',
          level: 'metric',
        },
        alias: 'Joined Orders Amount',
      },
      {
        name: 'long_ratio',
        type: 'FLOAT',
        mode: 'NULLABLE',
        status: 'CONNECTED',
        calculated: {
          formula:
            'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0) + ' +
            'SUM({{ref path="orders" field="amount"}}) / NULLIF(SUM({{ref field="clicks"}}), 0)',
          level: 'metric',
        },
      },
    ]);
  });

  /** The open formula popover, told apart by the diagnostics list only FormulaEditor renders. */
  function formulaPopover(page: Page): Locator {
    return page
      .locator('[data-slot="popover-content"]')
      .filter({ has: page.getByTestId('formula-diagnostics') });
  }

  /** What the editor shows, with Monaco's rendering of a space normalised back to a space. */
  function formulaText(page: Page): () => Promise<string> {
    return async () =>
      (await formulaPopover(page).locator('.view-lines').innerText())
        // Monaco draws a space as a non-breaking one; written as an ESCAPE, never as the character.
        .replace(/\u00a0/g, ' ')
        .trim();
  }

  /**
   * How a pill is painted, and how much of that paint its container lets through.
   *
   * `shadowVerticalReach` is what `getBoundingClientRect` cannot say: a box-shadow paints outside
   * the box, and only the y-offset and the spread of each shadow reach above and below it.
   */
  async function measurePill(pill: Locator) {
    return pill.evaluate(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      let clip: Element | null = element.parentElement;
      while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement;
      const clipBox = clip?.getBoundingClientRect();
      // `rgb(…) Xpx Ypx BLURpx SPREADpx`, one per shadow — the lengths are always in that order.
      const reach =
        [...style.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g)] // prettier-ignore
          .map(([, , y, , spread]) => Math.abs(Number(y)) + Number(spread));
      return {
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
        shadow: style.boxShadow,
        shadowVerticalReach: reach.length > 0 ? Math.max(...reach) : 0,
        roomAbove: clipBox ? box.top - clipBox.top : Number.MAX_SAFE_INTEGER,
        roomBelow: clipBox ? clipBox.bottom - box.bottom : Number.MAX_SAFE_INTEGER,
      };
    });
  }

  /** Opens a metric's formula popover with the caret at the end of the formula. */
  async function openFormulaEditor(
    page: Page,
    formula = METRIC_FORMULA,
    chipText = 'clicks'
  ): Promise<Locator> {
    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const formulaCell = findFormulaCell(page, formula);
    await expect(formulaCell).toBeVisible({ timeout: 15000 });
    await formulaCell.click();

    const popover = formulaPopover(page);
    const editor = popover.locator('.monaco-editor').first();
    await expect(editor).toBeVisible({ timeout: 15000 });
    // The chip is what says the editor is mounted, resolved and painted — not just present.
    await expect(popover.locator(CHIP)).toHaveText(chipText, { timeout: 15000 });
    await editor.click();
    await page.keyboard.press('End');
    return popover;
  }

  test('draws the same pill in the table row, before any editor opens (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const cell = findFormulaCell(page, METRIC_FORMULA);
    await expect(cell).toBeVisible({ timeout: 15000 });

    const chip = cell.locator(CHIP);
    await expect(chip).toHaveText('clicks');
    // Split into chip and plain spans, and still the formula it was: nothing dropped, nothing
    // repeated.
    expect(await cell.textContent()).toBe(METRIC_FORMULA);

    const rowPill = await measurePill(chip);
    // Painted at all — the row is the call site NOT inside Monaco, and the scope this rule used to
    // have would leave its pill blank while the editor's looked right.
    expect(rowPill.background).not.toBe('rgba(0, 0, 0, 0)');

    const popover = await openFormulaEditor(page);
    const editorPill = await measurePill(popover.locator(CHIP));

    // One definition, so one appearance — the point of section 3 is that a field looks like a field
    // whether or not the popover is open.
    expect(rowPill.background).toBe(editorPill.background);
    expect(rowPill.radius).toBe(editorPill.radius);
    expect(rowPill.shadow).toBe(editorPill.shadow);
    // …and the same appearance SURVIVES in both, which is a property of the pill's own geometry
    // rather than of whatever contains it: the shadow has no y-offset and no spread, so it reaches
    // sideways only and nothing above or below it can clip it. Measured, not assumed — `roomAbove`
    // and `roomBelow` are the room the nearest clipping ancestor actually leaves.
    expect(rowPill.shadowVerticalReach).toBe(0);
    expect(rowPill.roomAbove).toBeGreaterThanOrEqual(rowPill.shadowVerticalReach);
    expect(rowPill.roomBelow).toBeGreaterThanOrEqual(rowPill.shadowVerticalReach);
  });

  test('titles the popover with the metric and points at the docs (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    await expect(popover.getByRole('heading')).toHaveText('roas');

    // The hint has to be IN the footer's left half, not merely on screen: its whole point is the
    // dead space beside the buttons.
    const link = popover.getByRole('link', { name: /learn more/i });
    await expect(link).toHaveAttribute('href', /setup-guide\/calculated-fields\//);
    await expect(link).toHaveAttribute('href', /utm_source=owox_data_marts/);

    const hint = await link.boundingBox();
    const apply = await popover.getByRole('button', { name: 'Apply' }).boundingBox();
    expect(hint).not.toBeNull();
    expect(apply).not.toBeNull();
    expect((hint?.x ?? 0) + (hint?.width ?? 0)).toBeLessThanOrEqual(apply?.x ?? 0);
    // Same line, not stacked above it.
    expect(Math.abs((hint?.y ?? 0) - (apply?.y ?? 0))).toBeLessThan(20);
  });

  test('draws a resolved reference as a pill that changes no text metrics (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);
    const chip = popover.locator(CHIP);

    // One chip, over the field name and nothing else — `SUM` and the brackets stay plain.
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveText('clicks');

    const paint = await chip.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        radius: style.borderTopLeftRadius,
        shadow: style.boxShadow,
      };
    });
    // A class alone would satisfy a DOM assertion with the stylesheet missing entirely.
    expect(paint.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(paint.radius).not.toBe('0px');
    expect(paint.shadow).not.toBe('none');

    const box = await chip.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // Theme-aware, measured on the theme class MONACO itself puts on the editor (`vs` here) rather
    // than on a second reading of the app's. Swapped and restored inside one evaluate, so Monaco
    // never sees the editor under a class it did not write.
    const dark = await popover.evaluate((root, chipSelector) => {
      const editor = root.querySelector('.monaco-editor');
      const pill = root.querySelector(chipSelector);
      if (!editor || !pill) return null;
      editor.classList.replace('vs', 'vs-dark');
      const background = getComputedStyle(pill).backgroundColor;
      editor.classList.replace('vs-dark', 'vs');
      return background;
    }, CHIP);
    expect(dark).not.toBe('rgba(0, 0, 0, 0)');
    expect(dark).not.toBe(paint.background);

    // The pill's breathing room is a box-shadow, not padding, because Monaco places the caret from
    // the measured geometry of these very spans. With padding the caret and the characters part
    // company, which is the one chip defect a screenshot would not show. The caret is put on the
    // chip's right edge and has to land there to the pixel.
    await page.keyboard.press('ArrowLeft');
    // Polled, not read once: Monaco moves the caret element on its next animation frame, and
    // reading straight after the key press measures where the caret used to be.
    await expect
      .poll(async () =>
        popover.evaluate((root, chipSelector) => {
          const caret = root.querySelector('.cursors-layer .cursor');
          const pill = root.querySelector(chipSelector);
          if (!caret || !pill) return null;
          const gap = caret.getBoundingClientRect().left - pill.getBoundingClientRect().right;
          return Math.abs(gap) <= 2;
        }, CHIP)
      )
      .toBe(true);
  });

  test('steps the caret over a chip instead of into it (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    // From the right: one step reaches the chip's edge, the next must clear the whole name.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');

    // Without the jump the caret sits between `click` and `s`, and this reads `SUM(clickXs)`.
    await expect.poll(formulaText(page)).toBe('SUM(Xclicks)');
    // The reference is gone the moment its text stops resolving — chips carry no identity.
    await expect(popover.locator(CHIP)).toHaveCount(0);
  });

  test('steps the caret over a chip from the left as well (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    await openFormulaEditor(page);

    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.type('X');

    // Without the jump the fifth step lands after `c` and this reads `SUM(cXlicks)`.
    await expect.poll(formulaText(page)).toBe('SUM(clicksX)');
  });

  test('removes a whole chip with Backspace (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');

    // Monaco's own deleteLeft would take one character and leave `SUM(click)`.
    await expect.poll(formulaText(page)).toBe('SUM()');
    await expect(popover.locator(CHIP)).toHaveCount(0);
  });

  test('removes a whole chip with Delete (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    await page.keyboard.press('Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');

    // Monaco's own deleteRight would take one character and leave `SUM(licks)`.
    await expect.poll(formulaText(page)).toBe('SUM()');
    await expect(popover.locator(CHIP)).toHaveCount(0);
  });

  test('snaps a selection reaching into a chip out to its boundaries (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    await page.keyboard.press('Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    // One character into the chip. The selection Monaco makes is `c`; what must be highlighted is
    // the whole of `clicks`.
    await page.keyboard.press('Shift+ArrowRight');

    // Measured, not inferred: the drawn selection box has to sit exactly over the pill.
    await expect
      .poll(async () =>
        popover.evaluate((root, chipSelector) => {
          const selected = root.querySelector('.view-overlays .selected-text');
          const pill = root.querySelector(chipSelector);
          if (!selected || !pill) return null;
          const a = selected.getBoundingClientRect();
          const b = pill.getBoundingClientRect();
          return [Math.abs(a.left - b.left) < 1, Math.abs(a.right - b.right) < 1];
        }, CHIP)
      )
      .toEqual([true, true]);

    // …and the consequence that makes it worth having: typing over the selection replaces the
    // whole field name rather than its first letter.
    await page.keyboard.type('Z');
    await expect.poll(formulaText(page)).toBe('SUM(Z)');
  });

  test('lets a selection shrink back off a chip, not only grow over it (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openFormulaEditor(page);

    // Two steps left from the end: the first takes `)`, the second reaches into the chip and so
    // takes the whole of `clicks)`.
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    // Now back the other way. The head is shrinking the selection, so it must leave the chip the
    // side it came in and hand `clicks` back — with the head grown outward regardless of
    // direction, this key does NOTHING and the analyst has to reach for the mouse.
    await page.keyboard.press('Shift+ArrowRight');

    await page.keyboard.type('Z');
    // `)` replaced, `clicks` untouched. Inert Shift+ArrowRight leaves `SUM(Z` instead.
    await expect.poll(formulaText(page)).toBe('SUM(clicksZ');
  });

  test('keeps snapping after a press the editor never saw released (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    // Monaco raises `onMouseDown` for EVERY press — right-click included, where it starts no drag
    // and captures no pointer — but raises `onMouseUp` only for a release delivered back to its
    // view node. So a right-button press whose release lands elsewhere latches the drag deferral
    // on with nothing to switch it off, and every snap is silently dead from here on.
    //
    // Dispatched rather than driven with `page.mouse`, because a right press-and-release in place
    // does reach the view node and would heal the latch: the state under test is the one where it
    // never comes back, and this is the shortest honest way to reach it.
    await popover.locator('.view-lines').evaluate(lines => {
      lines.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2 }));
    });

    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.type('X');

    // The same measurement as the plain caret test — it just has to survive the stuck latch.
    await expect.poll(formulaText(page)).toBe('SUM(clicksX)');
  });

  test('copies a chip as its plain field name (DSET-10)', async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await openFormulaEditor(page);
    // Select-all is Monaco's keybinding, copy is the browser's — hence the two different
    // modifiers, which is the whole of the note on MONACO_MOD.
    await page.keyboard.press(`${MONACO_MOD}+A`);
    await page.keyboard.press('ControlOrMeta+C');

    // The real OS clipboard, filled by the real path: the browser's own copy raises a `copy` event
    // on the edit-context element, and Monaco's handler there fills it from the editor's selection.
    //
    // A chip is paint over plain text, so this is what the analyst gets — and it is the property
    // the whole design rests on: storing references structurally in the editor, the alternative
    // §3 of the spec rejected, would have put `{{ref path=… field=…}}` here instead.
    // Polled, like every other assertion here: a key press resolves when the event is dispatched,
    // not when the browser has finished writing the clipboard, and the read is its own round trip.
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(METRIC_FORMULA);
    expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain('{{');
  });

  test('restores the text and the chip together on undo (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await expect.poll(formulaText(page)).toBe('SUM()');

    await page.keyboard.press(`${MONACO_MOD}+Z`);

    // One undo, not six: the chip left as a single edit between two undo stops.
    await expect.poll(formulaText(page)).toBe(METRIC_FORMULA);
    await expect(popover.locator(CHIP)).toHaveText('clicks');

    // And back again, symmetrically: one redo takes the whole chip away, not one character of it.
    await page.keyboard.press(`${MONACO_MOD}+Shift+Z`);

    await expect.poll(formulaText(page)).toBe('SUM()');
    await expect(popover.locator(CHIP)).toHaveCount(0);
  });

  test('keeps a chip readable under the error the backend blames it for (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page);

    // A column read at row level BESIDE an aggregation: the live check comes back naming `clicks`,
    // so the field is a chip and the subject of a marker at the same time.
    //
    // Deliberately not a bare `clicks` on its own, which this test used until a row-level formula
    // became legal — such a formula is now a calculated DIMENSION and draws no violation at all.
    // Mixing the two levels is what is still refused, and it is refused about a FIELD, which is
    // what this test needs: a violation about a function or about the formula as a whole marks no
    // chip.
    // Typed at a human pace, and asserted before the check is asked about it. Every other burst in
    // this file is a single character; this one is nine, and fired as fast as CDP allows it
    // outruns the editor on a loaded machine — CI lost `clic` out of the middle and sent
    // `SUM(clicks) + ks`, a formula with nothing wrong in it, so the assertion below waited 15s
    // for a diagnostic that was never coming. Polling the text first says that in one line.
    await page.keyboard.type(' + clicks', { delay: 25 });
    await expect.poll(formulaText(page)).toBe('SUM(clicks) + clicks');

    await expect(page.getByTestId('formula-diagnostics')).toContainText('row-level column', {
      timeout: 15000,
    });

    // Paired by GEOMETRY rather than by document order: `clicks` now appears twice, and which
    // occurrences carry a marker is the backend's business, not this test's.
    const both = await popover.evaluate((root, chipSelector) => {
      const pills = Array.from(root.querySelectorAll(chipSelector));
      const squiggles = Array.from(root.querySelectorAll('.squiggly-error'));
      if (pills.length === 0 || squiggles.length === 0) return null;
      const squiggle = squiggles[0];
      const s = squiggle.getBoundingClientRect();
      const pill = pills.find(candidate => {
        const p = candidate.getBoundingClientRect();
        return Math.abs(s.left - p.left) < 2 && Math.abs(s.right - p.right) < 2;
      });
      return {
        background: pill ? getComputedStyle(pill).backgroundColor : null,
        squiggleDrawn: s.width > 0 && s.height > 0,
        overSameText: pill !== undefined,
        // Not one span wearing two classes: `setModelMarkers` draws through `className`, which
        // Monaco renders as an overlay div in its own layer, while the chip is an `inlineClassName`
        // on the text span itself. Neither can paint over the other, and this is the assertion that
        // would notice if a Monaco upgrade ever merged the two.
        separateLayers: pill ? !pill.contains(squiggle) && !squiggle.contains(pill) : false,
      };
    }, CHIP);

    expect(both).not.toBeNull();
    expect(both?.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(both?.squiggleDrawn).toBe(true);
    expect(both?.overSameText).toBe(true);
    expect(both?.separateLayers).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // What the pre-demo asked for: a chip that says which Data Mart it reads from, a formula with a
  // visible end, and a long formula that wraps rather than being cut off. All three are about what
  // is on screen — happy-dom has no layout, no hover widget and no wrapping.
  // ---------------------------------------------------------------------------

  test('names the joined Data Mart on hover, outside the popover (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    const popover = await openFormulaEditor(page, JOINED_FORMULA, 'orders.amount');
    const chip = popover.locator(CHIP);

    // Monaco opens its hover on a real pointer dwell; there is no API path to it from here. From
    // somewhere else first, so the move onto the pill is a move Monaco actually sees.
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(10, 10);
    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + (box?.height ?? 0) / 2, { steps: 10 });

    const hover = page.locator(HOVER_WIDGET);
    // Hosted on `body`, not in the popover: the popover animates with `transform`, which makes it
    // the containing block for `position: fixed` and would clip the hover inside the editor's
    // 140px box. This locator asserts the host and the text at once.
    await expect(hover).toBeVisible({ timeout: 15000 });
    await expect(hover).toContainText(JOINED_TITLE);
    await expect(hover).toContainText('amount');

    // …and it is actually readable: on screen, painted rather than a zero-sized box, and — the one
    // that matters on this branch, where "rendered but not visible" has shipped four times — NOT
    // COVERED. `toBeVisible` and a bounding box are both satisfied by a widget sitting under the
    // popover; only hit-testing the point a reader would look at can tell.
    const drawn = await hover.boundingBox();
    const viewport = page.viewportSize();
    expect(drawn?.width ?? 0).toBeGreaterThan(0);
    expect(drawn?.height ?? 0).toBeGreaterThan(0);
    expect(drawn?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(drawn?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((drawn?.x ?? 0) + (drawn?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);

    const onTop = await page.evaluate(
      ({ x, y }) => {
        const at = document.elementFromPoint(x, y);
        return at ? Boolean(at.closest('.monaco-hover')) : false;
      },
      {
        x: (drawn?.x ?? 0) + (drawn?.width ?? 0) / 2,
        y: (drawn?.y ?? 0) + (drawn?.height ?? 0) / 2,
      }
    );
    expect(onTop).toBe(true);
  });

  test('the row chip carries the same answer as the editor (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const cell = findFormulaCell(page, JOINED_FORMULA);
    await expect(cell).toBeVisible({ timeout: 15000 });

    // The pill carries its own answer, which is what a hover on the pill actually shows. The cell
    // around it no longer carries a `title` of its own for that answer to have to win over.
    await expect(cell.locator(CHIP)).toHaveAttribute(
      'title',
      `amount from the joined Data Mart \u201C${JOINED_TITLE}\u201D`
    );
  });

  // NOTE: nothing here asserts a visible END to the formula, because there no longer is one. A
  // filled surface and then a rule at the band's edge were both built and both rejected by the
  // product owner; deliverable 5's requirement is open, not met. What is left to pin is the state
  // he chose — plain text, inside its own band — so neither of the rejected marks returns unnoticed.
  test('keeps the formula plain text on the row, inside its own band (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const cell = findFormulaCell(page, JOINED_FORMULA);
    await expect(cell).toBeVisible({ timeout: 15000 });

    const surface = cell.locator('[data-slot="popover-trigger"]').first();
    // No fill: the surface tried here read as a value belonging to the `Mode` / `PK` /
    // aggregations headers it sat under.
    const fill = await surface.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(fill).toBe('rgba(0, 0, 0, 0)');

    // …and no rule at the band's edge either, which was the second attempt.
    const border = await surface.evaluate(element => {
      const host = element.closest('td');
      return host ? Number.parseFloat(getComputedStyle(host).borderRightWidth) : -1;
    });
    expect(border).toBe(0);

    // Containment only, and deliberately labelled as such: the trigger is `w-full` inside its own
    // cell and the alias lives in the next one, so this has always held. It is here to catch a
    // formula that ever grows past its band, not as evidence of any separation.
    const formulaBox = await surface.boundingBox();
    const aliasBox = await page
      .getByText('Joined Orders Amount', { exact: true })
      .first()
      .boundingBox();
    expect(formulaBox).not.toBeNull();
    expect(aliasBox).not.toBeNull();
    expect((formulaBox?.x ?? 0) + (formulaBox?.width ?? 0)).toBeLessThanOrEqual(aliasBox?.x ?? 0);
  });

  test('clamps a long formula to two lines instead of growing the row (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const shortCell = findFormulaCell(page, METRIC_FORMULA);
    await expect(shortCell).toBeVisible({ timeout: 15000 });
    const longCell = findFormulaCell(page, LONG_FORMULA);
    await expect(longCell).toBeVisible({ timeout: 15000 });

    const longSurface = longCell.locator('[data-slot="popover-trigger"]').first();
    const shortSurface = shortCell.locator('[data-slot="popover-trigger"]').first();

    const measured = await longSurface.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        whiteSpace: style.whiteSpace,
        lineClamp: style.webkitLineClamp,
        // Nothing is hidden sideways: the text wraps, so the formula never widens its column.
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    });

    // The author's own line breaks fold into spaces, which is what lets a clamp count lines of
    // rendered text rather than lines of source.
    expect(measured.whiteSpace).toBe('normal');
    expect(measured.lineClamp).toBe('2');
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth + 1);

    // The point of the clamp: a long formula costs the row nothing. Compared against a row whose
    // formula fits on one line, because the row's height comes from the controls beside it.
    const longRow = await longSurface.evaluate(
      element => element.closest('tr')?.getBoundingClientRect().height ?? -1
    );
    const shortRow = await shortSurface.evaluate(
      element => element.closest('tr')?.getBoundingClientRect().height ?? -1
    );
    expect(longRow).toBeGreaterThan(0);
    expect(longRow).toBe(shortRow);

    // The whole formula is still in the DOM, chips included — clipped for the eye, not truncated
    // in the text — and it is what the hover card reads.
    expect((await longCell.textContent())?.trim()).toBe(LONG_FORMULA);
    const chips = longCell.locator(CHIP);
    await expect(chips).toHaveCount(4);
    const painted = await chips.evaluateAll(elements =>
      elements.map(element => {
        const box = element.getBoundingClientRect();
        return {
          background: getComputedStyle(element).backgroundColor,
          drawn: box.width > 0 && box.height > 0,
        };
      })
    );
    painted.forEach(pill => {
      expect(pill.drawn).toBe(true);
      expect(pill.background).not.toBe('rgba(0, 0, 0, 0)');
    });
  });

  test('shows the whole formula in a hover card the clamped row cannot (DSET-10)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(`/ui/0/data-marts/${dataMartId}/data-setup`);
    await expect(page.getByTestId(TESTIDS.datamartTabDataSetup)).toBeVisible();

    const longCell = findFormulaCell(page, LONG_FORMULA);
    await expect(longCell).toBeVisible({ timeout: 15000 });

    const card = page.locator('[data-slot="hover-card-content"]');
    await expect(card).toHaveCount(0);

    await longCell.hover();
    await expect(card).toBeVisible({ timeout: 15000 });
    expect((await card.textContent())?.trim()).toBe(LONG_FORMULA);
  });

  test('still opens the suggest list with the chip layer attached (DSET-10)', async ({ page }) => {
    test.setTimeout(90_000);

    await openFormulaEditor(page);
    await page.keyboard.type('c');

    // The interception adds a keydown listener that stops propagation for two keys. If it ever
    // stops more than that, this is where autocomplete goes quiet.
    await expect(page.locator(SUGGEST_WIDGET)).toBeVisible({ timeout: 15000 });
  });
});
