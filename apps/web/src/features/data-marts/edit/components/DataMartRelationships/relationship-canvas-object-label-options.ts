import type { ObjectLabelOption } from '../../../shared/canvas/object-labels';

/**
 * The Joinable Data Marts diagram settings checkboxes — one per thing a card
 * shows, in card order, worded as on the Models canvas. There is no draft
 * option: the warning above a card already names a draft.
 */
export const RELATIONSHIP_CANVAS_OBJECT_LABEL_OPTIONS: readonly ObjectLabelOption[] = [
  { part: 'source', label: 'Input source', helper: 'View, Table, SQL, Pattern or Connector' },
  { part: 'fields', label: 'Fields', helper: 'Fields the relationship brings in' },
  { part: 'triggers', label: 'Triggers', helper: 'Scheduled triggers of the Data Mart' },
  { part: 'reports', label: 'Reports', helper: 'Reports built on the Data Mart' },
  { part: 'relationships', label: 'Relationships', helper: 'Joins with other Data Marts' },
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
