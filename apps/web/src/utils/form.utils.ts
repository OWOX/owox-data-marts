/**
 * Creates a mutable copy of form data for safe manipulation.
 * This is commonly used when you need to conditionally modify
 * form data before submission without affecting the original object.
 */
export function createFormPayload<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}
