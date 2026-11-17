import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router';
import { useUrlParam } from './useUrlParam';

interface UseRecordSheetOptions<T> {
  /** The query parameter that holds the id of the record the sheet shows. */
  param: string;
  /** The loaded records, or `undefined` before the first load. Pass the unfiltered list. */
  records: readonly T[] | undefined;
  getId: (record: T) => string;
  /** The toast for a link to a record that never resolved. A record that leaves the list while open closes silently. Without it, the link is dropped silently. */
  notFoundMessage?: (id: string) => string;
}

/**
 * Keeps the record that a sheet shows in the URL, so the page URL opens the same sheet.
 * `link` is that URL for the open record, for a Copy link button.
 */
export function useRecordSheet<T>({
  param,
  records,
  getId,
  notFoundMessage,
}: UseRecordSheetOptions<T>) {
  const { pathname } = useLocation();
  const { value: id, setParam, removeParam } = useUrlParam(param);
  const live = id && records ? (records.find(item => getId(item) === id) ?? null) : null;
  const missing = Boolean(id && records && !live);
  // A refetch gives new objects; the open sheet keeps the first one so that its form does not reset.
  const [kept, setKept] = useState<{ id: string; record: T } | null>(null);
  if (live && id && kept?.id !== id) setKept({ id, record: live });
  else if (!id && kept) setKept(null);
  const record = live && kept?.id === id ? kept.record : live;
  const resolvedId = useRef<string | null>(null);

  useEffect(() => {
    if (record && id) resolvedId.current = id;
    else if (!id) resolvedId.current = null;
  }, [record, id]);

  useEffect(() => {
    if (!missing || !id) return;
    // A record that left the list while its sheet was open (delete, approve) needs no toast.
    const left = resolvedId.current === id;
    // The toast id stops a second toast when an effect runs twice.
    if (!left && notFoundMessage) toast.error(notFoundMessage(id), { id: `${param}-not-found` });
    removeParam();
  }, [missing, id, param, notFoundMessage, removeParam]);

  let link: string | null = null;
  if (record && id) {
    const url = new URL(pathname, window.location.origin);
    url.searchParams.set(param, id);
    link = url.toString();
  }

  return { record, open: setParam, close: removeParam, link };
}
