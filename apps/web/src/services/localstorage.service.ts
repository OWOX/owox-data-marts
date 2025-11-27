/**
 * Type definition for supported value types in localStorage
 */
export type StorageValueType = string | number | boolean | object | null;

/**
 * Service for managing localStorage operations with type safety and error handling
 */
export class LocalStorageService {
  /**
   * Set a value in localStorage
   * @param key - The key to store the value under
   * @param value - The value to store (can be any supported type)
   */
  set(key: string, value: StorageValueType): void {
    try {
      // Convert the value to a string based on its type
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      localStorage.setItem(key, stringValue);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }

  /**
   * Get a value from localStorage with type conversion
   * @param key - The key to retrieve
   * @param type - Optional type hint for value conversion ('boolean' | 'json')
   * @returns The stored value converted to the specified type, or null if not found
   */
  get(key: string, type?: 'boolean'): boolean | null;
  get(key: string, type?: 'json'): Record<string, unknown> | null;
  get(key: string, type?: 'boolean' | 'json'): StorageValueType {
    try {
      const value = localStorage.getItem(key);

      if (value === null) {
        return null;
      }

      // Convert the value based on the specified type
      switch (type) {
        case 'boolean':
          return value === 'true';
        case 'json': {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          if (typeof parsed === 'object') {
            return parsed;
          }
          return null;
        }
        default:
          return value;
      }
    } catch (error) {
      console.error(`Error getting localStorage key "${key}":`, error);
      return null;
    }
  }

  /**
   * Remove a specific key from localStorage
   * @param key - The key to remove
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }

  /**
   * Check if a key exists in localStorage
   * @param key - The key to check
   * @returns boolean indicating if the key exists
   */
  has(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.error(`Error checking localStorage key "${key}":`, error);
      return false;
    }
  }

  /**
   * Clear all data from localStorage
   */
  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }
}

// Export a singleton instance
export const storageService = new LocalStorageService();
