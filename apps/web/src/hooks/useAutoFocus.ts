import { useEffect } from 'react';

interface UseAutoFocusOptions {
  elementId: string;
  isOpen: boolean;
  delay?: number;
  selectText?: boolean;
}

export function useAutoFocus({
  elementId,
  isOpen,
  delay = 100,
  selectText = false,
}: UseAutoFocusOptions) {
  useEffect(() => {
    if (isOpen) {
      // Focus the input after a short delay to ensure the component is fully rendered
      const timeoutId = setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          const inputElement = element as HTMLInputElement;
          inputElement.focus();

          if (selectText && inputElement.value) {
            // Select all text if explicitly requested
            inputElement.select();
          } else if (inputElement.value) {
            // Move cursor to end without selecting text
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
          }
        }
      }, delay);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [isOpen, elementId, delay, selectText]);
}
