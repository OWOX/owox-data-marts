import type { ObjectLabelOption } from '../../shared/canvas/object-labels';

/** The Models canvas settings checkboxes — one per thing a card shows, in card order. */
export const MODEL_CANVAS_OBJECT_LABEL_OPTIONS: readonly ObjectLabelOption[] = [
  { part: 'source', label: 'Input source', helper: 'View, Table, SQL, Pattern or Connector' },
  { part: 'fields', label: 'Fields', helper: 'Number of fields in the Output Schema' },
  { part: 'triggers', label: 'Triggers', helper: 'Scheduled triggers of the Data Mart' },
  { part: 'reports', label: 'Reports', helper: 'Reports built on the Data Mart' },
  { part: 'relationships', label: 'Relationships', helper: 'Joins with other Data Marts' },
  { part: 'status', label: 'Draft badge', helper: 'Shown on Data Marts not yet published' },
  {
    part: 'footer',
    label: 'Quality and sharing',
    helper: 'Data Quality, Data Last Updated and sharing icons',
  },
  {
    part: 'fieldAlias',
    label: 'Field aliases',
    helper: 'Output Schema alias in place of the name',
  },
  {
    part: 'fieldDescription',
    label: 'Field descriptions',
    helper: 'Output Schema description under each field',
  },
];
