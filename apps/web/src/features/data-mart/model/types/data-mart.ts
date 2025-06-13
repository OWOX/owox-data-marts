import type { DataMart } from './data-mart-model';

/**
 * Data mart state interface
 */
export interface DataMartState {
  /**
   * Loading state
   */
  isLoading: boolean;

  /**
   * Error message if any
   */
  error: string | null;

  /**
   * Current data mart
   */
  dataMart: DataMart | null;
}

/**
 * Data mart form state interface
 */
export interface DataMartFormState {
  /**
   * Form submission status
   */
  isSubmitting: boolean;

  /**
   * Form validation errors
   */
  errors: Record<string, string>;
}
