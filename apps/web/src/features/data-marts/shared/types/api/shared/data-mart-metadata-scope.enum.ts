/**
 * Mirror of the backend `DataMartMetadataScope` enum.
 * Keep values in sync with `apps/backend/src/data-marts/ai-insights/ai-insights-types.ts`.
 */
export enum DataMartMetadataScope {
  TITLE = 'title',
  DESCRIPTION = 'description',
  FIELD_ALIAS = 'field_alias',
  FIELD_DESCRIPTION = 'field_description',
  ALL_FIELD_DESCRIPTIONS = 'all_field_descriptions',
  ALL_FIELD_ALIASES = 'all_field_aliases',
}
