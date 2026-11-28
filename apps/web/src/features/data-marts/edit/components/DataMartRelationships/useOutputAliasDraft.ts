import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '../../../../../hooks/useDebounce';
import type { SourceEntry } from './source-entries';

export interface OutputAliasDraft {
  /** The alias as saved, for labels that must not follow every keystroke. */
  savedValue: string;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
}

/**
 * The editable Output Alias of a joined Data Mart: typed text saves after a pause or on blur.
 * Owned by the component that outlives the Report Fields tab (the accordion row, the details
 * sheet), so switching tabs or collapsing the row does not drop a pending save.
 */
export function useOutputAliasDraft(
  source: SourceEntry | null,
  fallbackAlias: string,
  onAliasChange: (source: SourceEntry, alias: string) => void
): OutputAliasDraft {
  const savedAlias = source?.alias ?? '';
  const savedValue = savedAlias || fallbackAlias;
  const [localAlias, setLocalAlias] = useState(savedValue);
  const debouncedAlias = useDebounce(localAlias, 500);
  const lastSavedAlias = useRef(savedAlias);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    setLocalAlias(savedValue);
    lastSavedAlias.current = savedAlias;
    isDirtyRef.current = false;
  }, [savedAlias, savedValue]);

  useEffect(() => {
    if (!source) return;
    if (!isDirtyRef.current || debouncedAlias !== localAlias) return;
    if (debouncedAlias !== lastSavedAlias.current) {
      onAliasChange(source, debouncedAlias);
      lastSavedAlias.current = debouncedAlias;
      isDirtyRef.current = false;
    }
  }, [debouncedAlias, localAlias, source, onAliasChange]);

  const saveNow = () => {
    if (!source || !isDirtyRef.current) return;
    if (localAlias !== lastSavedAlias.current) {
      onAliasChange(source, localAlias);
      lastSavedAlias.current = localAlias;
    }
    isDirtyRef.current = false;
  };

  // Closing the panel, or the row unmounting, inside the typing pause would otherwise drop the
  // rename: an input removed from the page gets no blur.
  const saveOnUnmountRef = useRef(saveNow);
  saveOnUnmountRef.current = () => {
    if (isDirtyRef.current) saveNow();
  };
  useEffect(
    () => () => {
      saveOnUnmountRef.current();
    },
    []
  );

  return {
    savedValue,
    value: localAlias,
    onChange: next => {
      setLocalAlias(next);
      isDirtyRef.current = true;
    },
    onBlur: () => {
      saveNow();
      if (localAlias === '') setLocalAlias(fallbackAlias);
    },
  };
}
