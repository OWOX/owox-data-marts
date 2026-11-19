import { useEffect, useRef, useState } from 'react';

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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  const copyToClipboard = async (text: string, section: string): Promise<boolean> => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      if (!mountedRef.current) return true;
      setCopiedSection(section);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopiedSection(null);
      }, 2000);
      return true;
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // An earlier copy must not still read "Copied" next to this failure.
      clearTimeout(timerRef.current);
      if (mountedRef.current) setCopiedSection(null);
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
