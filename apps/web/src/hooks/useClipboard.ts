import { useState } from 'react';

export interface UseClipboardResult {
  copiedSection: string | null;
  /**
   * Copies provided text to the clipboard.
   * Returns true on success, false otherwise. Never throws.
   */
  copyToClipboard: (text: string, section: string) => Promise<boolean>;
  /**
   * Fire-and-forget version of copy that preserves the previous API used across the app.
   */
  handleCopy: (text: string, section: string) => void;
}

export function useClipboard(): UseClipboardResult {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string): Promise<boolean> => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => {
        setCopiedSection(null);
      }, 2000);
      return true;
    } catch (err) {
      console.error('Failed to copy text: ', err);
      return false;
    }
  };

  const handleCopy = (text: string, section: string) => {
    void copyToClipboard(text, section);
  };

  return {
    copiedSection,
    copyToClipboard,
    handleCopy,
  };
}
