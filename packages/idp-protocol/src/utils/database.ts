/**
 * Database utilities with primitive types only
 * No dependency on DB_TYPE - works with any database
 */

/**
 * JSON transformer for text columns (works with all databases)
 */
export const jsonTransformer = {
  to: (value: any): string => {
    if (typeof value === 'string') return value;
    return JSON.stringify(value || {});
  },
  from: (value: string): any => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  },
};

/**
 * Boolean transformer for integer columns (works with all databases)
 */
export const booleanTransformer = {
  to: (value: boolean): number => (value ? 1 : 0),
  from: (value: number): boolean => !!value,
};

/**
 * Date transformer for text columns (ISO string format)
 */
export const dateTransformer = {
  to: (value: Date): string => {
    if (!value) return new Date().toISOString();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  },
  from: (value: string): Date => {
    return new Date(value);
  },
};
