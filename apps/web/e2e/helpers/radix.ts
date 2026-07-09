import { type Page, type Locator, expect } from '@playwright/test';
import { TESTIDS } from '../selectors/testids';

export class RadixHelpers {
  constructor(private page: Page) {}

  /**
   * Select an option from a Radix Select component.
   * Clicks trigger, waits for content to appear in portal, clicks option.
   */
  async selectOption(trigger: Locator, optionText: string | RegExp): Promise<void> {
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
   * Returns the topmost open Dialog content layer.
   */
  confirmationDialog(): Locator {
    return this.page.locator('[data-slot="dialog-content"]').last();
  }

  /**
   * Click the confirm button in a ConfirmationDialog.
   * ConfirmationDialog has a confirm button with the label passed as confirmLabel (default "Confirm").
   */
  async confirmDialog(confirmLabel = 'Confirm'): Promise<void> {
    const dialog = this.confirmationDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: confirmLabel }).click();
    await expect(dialog).not.toBeVisible();
  }

  /**
   * Click the cancel button in the standard unsaved-changes sheet guard dialog.
   * Asserts the host sheet stays open — the regression guard for the nested
   * dismissable-layer fix from PR #1355.
   */
  async stayOnDirtySheet(hostSheet: Locator): Promise<void> {
    const dialog = this.confirmationDialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible();
    await dialog.getByRole('button', { name: 'No, stay here' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(hostSheet).toBeVisible();
  }

  /**
   * Confirm leaving a dirty sheet via the standard unsaved-changes dialog.
   */
  async leaveDirtySheet(hostSheet: Locator): Promise<void> {
    const dialog = this.confirmationDialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Yes, leave now' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(hostSheet).not.toBeVisible();
  }

  /**
   * Dismiss a sheet-hosted confirmation dialog via its cancel button and
   * assert the host sheet remains open.
   */
  async cancelSheetHostedDialog(hostSheet: Locator, cancelLabel: string | RegExp): Promise<void> {
    const dialog = this.confirmationDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: cancelLabel }).click();
    await expect(dialog).not.toBeVisible();
    await expect(hostSheet).toBeVisible();
  }

  /**
   * Close FloatingPopover if it's open.
   * Useful when popover blocks interaction with other elements.
   */
  async closeFloatingPopoverIfOpen(): Promise<void> {
    const closeButton = this.page.getByTestId(TESTIDS.floatingPopoverClose);

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      // Wait for popover to disappear
      await closeButton.waitFor({ state: 'hidden' }).catch(() => undefined);
    }
  }
}
