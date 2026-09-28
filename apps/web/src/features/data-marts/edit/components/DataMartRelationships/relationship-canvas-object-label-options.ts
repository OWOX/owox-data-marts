import type { ObjectLabelOption } from '../../../shared/canvas/object-labels';

/** The Joinable Data Marts diagram settings checkboxes — one per thing a card shows. */
export const RELATIONSHIP_CANVAS_OBJECT_LABEL_OPTIONS: readonly ObjectLabelOption[] = [
  { part: 'source', label: 'Input source', helper: 'View, Table, SQL, Pattern or Connector' },
  { part: 'fields', label: 'Field count', helper: 'Fields of the Data Mart' },
  { part: 'status', label: 'Status', helper: 'Published or draft dot next to the title' },
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
