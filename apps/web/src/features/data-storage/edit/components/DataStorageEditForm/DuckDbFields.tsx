import { FormItem, FormLabel, FormDescription, FormSection } from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { CopyableField } from '@owox/ui/components/common/copyable-field';

interface DuckDbFieldsProps {
  /** Read-only, server-managed .duckdb path; absent for a not-yet-saved storage. */
  databasePath?: string;
}

/**
 * Configuration section for a saved DuckDB storage: shows the server-managed
 * database file path (read-only, click-to-copy) plus GUI-client connection help.
 * Renders nothing until the storage is saved and a path is available.
 */
export function DuckDbFields({ databasePath }: DuckDbFieldsProps) {
  if (!databasePath) {
    return null;
  }

  // FormSection defaults to open (defaultOpen=true). Keep it open: a collapsed
  // FormSection does not mount its children, which would hide the path entirely.
  return (
    <FormSection title='Configuration' name='storage-duckdb-config'>
      <FormItem>
        <FormLabel tooltip='The local DuckDB database file managed by self-hosted OWOX Data Marts'>
          Database file path
        </FormLabel>
        <CopyableField value={databasePath} doNotTruncateContent />
        <FormDescription>The file is created on the first connector run or read.</FormDescription>
        <FormDescription>
          <Accordion variant='common' type='single' collapsible>
            <AccordionItem value='duckdb-connect-help'>
              <AccordionTrigger>How do I connect to this database?</AccordionTrigger>
              <AccordionContent>
                <p>
                  Open the file with a client on DuckDB 2.0 or later — DBeaver, DataGrip, TablePlus,
                  or the built-in DuckDB UI (<code>duckdb -ui</code>). Create a new DuckDB
                  connection and point it at the path above. While a data load is running the file
                  is locked for a single writer, so connect in <strong>read-only</strong> mode to
                  avoid conflicts.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </FormDescription>
      </FormItem>
    </FormSection>
  );
}
