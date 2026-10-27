import { useCallback } from 'react';
import type * as Monaco from 'monaco-editor';
import { DataMartMentionPicker } from '../../../../../../shared/components/DescriptionEditor/DataMartMentionPicker';
import type { DataMartReference } from '../../../../../../shared/components/DescriptionEditor/data-mart-mentions';
import { useStorageDataMartReferences } from '../../../../../../shared/components/DescriptionEditor/useDataMartReferences';
import { trackEvent } from '../../../../../../utils';
import { sqlDataMartReference, sqlReferenceAtCursor } from './sql-data-mart-references';

/** What the SQL editor needs to let its query reference other Data Marts. */
export interface SqlReferencesContext {
  projectId: string;
  /** The Data Mart whose SQL is edited; it is not offered as a reference to itself. */
  dataMartId: string;
  storageId: string;
  storageTitle: string;
}

/**
 * Typing `@` in the SQL editor opens a list of the published Data Marts of the same Storage;
 * picking one inserts `[Title](dm:<id>)`, which the backend resolves to that Data Mart's SQL or
 * table when the query runs.
 */
export function SqlDataMartReferencePicker({
  editor,
  projectId,
  dataMartId,
  storageId,
  storageTitle,
}: SqlReferencesContext & { editor: Monaco.editor.IStandaloneCodeEditor | null }) {
  const loadDataMarts = useStorageDataMartReferences(projectId, storageId, dataMartId);
  const handleInsert = useCallback(
    (reference: DataMartReference) => {
      trackEvent({
        event: 'data_mart_reference_inserted',
        category: 'DataMart',
        action: 'InsertReference',
        context: dataMartId,
        label: reference.id,
      });
    },
    [dataMartId]
  );

  return (
    <DataMartMentionPicker
      editor={editor}
      projectId={projectId}
      currentDataMartId={dataMartId}
      disabled={false}
      findMention={sqlReferenceAtCursor}
      loadDataMarts={loadDataMarts}
      formatReference={sqlDataMartReference}
      pickFields={false}
      note={`Only Data Marts from ${storageTitle} can be referenced.`}
      onInsert={handleInsert}
    />
  );
}
