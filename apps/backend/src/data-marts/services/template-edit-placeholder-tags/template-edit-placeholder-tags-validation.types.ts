export const TEMPLATE_PLACEHOLDER_TAG_VALIDATION_ERROR_CODES = [
  'template_text_contains_raw_tag_syntax',
  'template_placeholder_invalid_format',
  'template_placeholder_unknown_id',
  'template_tag_unused_definition',
  'template_tag_duplicate_id',
  'template_tag_unsupported_name',
  'template_tag_invalid_params',
  'template_tag_invalid_source',
  'template_render_invalid',
] as const;

export type TemplatePlaceholderTagValidationErrorCode =
  (typeof TEMPLATE_PLACEHOLDER_TAG_VALIDATION_ERROR_CODES)[number];

export interface TemplatePlaceholderTagValidationError {
  code: TemplatePlaceholderTagValidationErrorCode;
  message: string;
  path?: Array<string | number>;
  details?: Record<string, unknown>;
}

export type TemplatePlaceholderTagValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: TemplatePlaceholderTagValidationError };

export function okTemplatePlaceholderTagValidation<T>(
  value: T
): TemplatePlaceholderTagValidationResult<T> {
  return { ok: true, value };
}

export function failTemplatePlaceholderTagValidation(
  error: TemplatePlaceholderTagValidationError
): TemplatePlaceholderTagValidationResult<never> {
  return { ok: false, error };
}
