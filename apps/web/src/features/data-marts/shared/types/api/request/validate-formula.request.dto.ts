/**
 * A calculated field as the schema editor is HOLDING it, saved or not.
 *
 * The Output Schema editor defers its save, so the fields on screen and the fields on disk are not
 * the same list, and the whole point of the feature — `roas = revenue / cost` written in one sitting —
 * names two siblings the server has never seen.
 */
export interface DraftCalculatedFieldDto {
  name: string;
  type: string;
  /** STORED form, exactly like `formula` below. */
  formula: string;
}

/**
 * Body of `POST /data-marts/:id/schema/validate-formula` — one calculated field's formula, judged
 * on its own, saving nothing and touching no warehouse.
 */
export interface ValidateFormulaRequestDto {
  /**
   * The name the field would be saved under. A field of this name in the current schema is
   * REPLACED by this formula for the check, so a formula naming its own field reads as the
   * self-reference it would be at save time.
   */
  name: string;
  /** The field's output type, in the storage's own vocabulary. */
  type: string;
  /**
   * The formula in STORED form — dialect SQL carrying `{{ref}}` tags, the same shape the schema
   * save carries, never the authoring text the analyst sees.
   */
  formula: string;
  /**
   * Every calculated field the editor is holding. Sent, these REPLACE the persisted formulas for
   * the check, which is what lets a reference to a sibling added in this session resolve instead
   * of coming back as "no longer exists in the Data Mart".
   *
   * Omitted when there are none to report — never sent empty. An empty list and an absent one mean
   * the same thing to the endpoint (fall back to the persisted schema), and that is the reading a
   * caller with no draft to offer needs.
   */
  calculatedFields?: readonly DraftCalculatedFieldDto[];
}
