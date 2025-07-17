import { useState } from 'react';

export interface UseClipboardResult {
  copiedSection: string | null;
  copyToClipboard: (text: string, section: string) => Promise<void>;
  handleCopy: (text: string, section: string) => void;
}

export function useClipboard(): UseClipboardResult {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => {
        setCopiedSection(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
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
