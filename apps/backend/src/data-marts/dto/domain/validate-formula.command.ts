/**
 * A calculated field as the schema EDITOR holds it — not as any save persisted it.
 *
 * The Output Schema editor is deferred-save: rows are added, renamed and given formulas in local
 * state, and only the Save button writes any of it. A formula written in that session can name a
 * sibling that exists nowhere on disk yet, which is the feature's headline flow
 * (`roas = revenue / cost`, all three written in one sitting).
 */
export interface DraftCalculatedField {
  name: string;
  type: string;
  /** STORED form — dialect SQL carrying `{{ref}}` tags, the same shape the save carries. */
  formula: string;
}

export class ValidateFormulaCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly name: string,
    public readonly type: string,
    public readonly formula: string,
    public readonly userId: string,
    public readonly roles: string[],
    /**
     * Every calculated field the editor is holding, or undefined when the caller has none to
     * report. Undefined and empty mean the same thing on purpose — fall back to the persisted
     * schema — because a client that cannot see the draft (a read-only table, an API caller) sends
     * nothing, and reading that as "this Data Mart has no calculated fields" would delete every
     * persisted sibling from the check and report the exact error this field exists to prevent.
     */
    public readonly calculatedFields?: readonly DraftCalculatedField[]
  ) {}
}
