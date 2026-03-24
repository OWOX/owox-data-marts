import { type Page, type Locator, expect } from '@playwright/test';

export class RadixHelpers {
  constructor(private page: Page) {}

  /**
   * Select an option from a Radix Select component.
   * Clicks trigger, waits for content to appear in portal, clicks option.
   */
  async selectOption(trigger: Locator, optionText: string): Promise<void> {
    await trigger.click();
    // Radix Select portals content to body with role="listbox"
    const listbox = this.page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: optionText }).click();
    // Wait for content to disappear (animation completes)
    await expect(listbox).not.toBeVisible();
  }

  /**
   * Select an option from a cmdk-based Combobox (Popover + Command).
   * Used by the shared Combobox component in apps/web.
   */
  async selectComboboxOption(
    trigger: Locator,
    optionText: string,
    searchText?: string
  ): Promise<void> {
    await trigger.click();
    // cmdk Combobox uses Popover which portals content
    const popover = this.page.locator('[data-slot="select-content"], [role="dialog"]').last();
    await expect(popover).toBeVisible();
    if (searchText) {
      await popover.getByRole('textbox').fill(searchText);
    }
    await popover.getByRole('option', { name: optionText }).click();
  }

  /**
   * Dismiss a Sheet by pressing Escape. Waits for close animation (300ms).
   */
  async dismissSheet(sheetContent: Locator): Promise<void> {
    await expect(sheetContent).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(sheetContent).not.toBeVisible();
  }

  /**
   * Dismiss a Dialog by pressing Escape. Waits for close animation.
   */
  async dismissDialog(dialogContent: Locator): Promise<void> {
    await expect(dialogContent).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(dialogContent).not.toBeVisible();
  }

  /**
   * Click the confirm button in a ConfirmationDialog.
   * ConfirmationDialog has a confirm button with the label passed as confirmLabel (default "Confirm").
   */
  async confirmDialog(confirmLabel = 'Confirm'): Promise<void> {
    const dialog = this.page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: confirmLabel }).click();
    await expect(dialog).not.toBeVisible();
  }
}
