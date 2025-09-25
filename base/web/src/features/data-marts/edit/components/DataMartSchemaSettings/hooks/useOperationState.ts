import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook for managing operation state.
 * Extracts operation state management logic from the DataMartSchemaSettings component.
 *
 * @param isLoading - Whether an operation is in progress
 * @param error - Any error that occurred during the operation
 * @returns An object containing the operation state and functions to update it
 */
export function useOperationState(isLoading: boolean, error: unknown) {
  // Refs to track operations in progress
  const saveInProgressRef = useRef(false);
  const actualizeInProgressRef = useRef(false);

  // State to track the status of the current operation
  const [operationStatus, setOperationStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Listen for changes in loading and error states
  useEffect(() => {
    // If we were saving or actualizing and now it's done
    if (!isLoading) {
      if (saveInProgressRef.current || actualizeInProgressRef.current) {
        // Set the operation status based on whether there was an error
        setOperationStatus(error ? 'error' : 'success');

        // Reset operation flags
        saveInProgressRef.current = false;
        actualizeInProgressRef.current = false;
      }
    }
  }, [isLoading, error]);

  /**
   * Starts a save operation.
   * Sets the saveInProgressRef flag and resets the operation status.
   */
  const startSaveOperation = () => {
    saveInProgressRef.current = true;
    setOperationStatus('idle');
  };

  /**
   * Starts an actualize operation.
   * Sets the actualizeInProgressRef flag and resets the operation status.
   */
  const startActualizeOperation = () => {
    actualizeInProgressRef.current = true;
    setOperationStatus('idle');
  };

  /**
   * Resets the operation status to idle.
   */
  const resetOperationStatus = () => {
    setOperationStatus('idle');
  };

  return {
    operationStatus,
    startSaveOperation,
    startActualizeOperation,
    resetOperationStatus,
  };
}
