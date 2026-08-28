import type { Locator, Page } from '@playwright/test';

/**
 * The Output Schema row cell showing `formula`.
 *
 * The cell used to carry the whole formula as its `title`, which is what these specs located it
 * by. It no longer does: the row shows a clamped preview and the full formula moved into a hover
 * card, and a native tooltip alongside that card would be a second, worse telling of the same
 * thing. The cell is the card's trigger, so the slot Radix puts there is what identifies it now.
 *
 * Matched on the cell's EXACT text rather than a substring, because one fixture formula is a
 * substring of another (`SUM(clicks)` inside the long one).
 */
export function findFormulaCell(page: Page, formula: string): Locator {
  const exact = new RegExp(`^${formula.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return page.locator('[data-slot="hover-card-trigger"]').filter({ hasText: exact }).first();
}
