import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { dataDestinationService } from '../../../../../data-destination';
import { showApiErrorToast } from '../../../../../../shared/utils/showApiErrorToast';
import {
  DEFAULT_REPORT_TITLE,
  getGoogleSheetTabUrl,
  isValidGoogleSheetsUrl,
} from '../../../shared';
import type { ReportEditFormValues } from '../../hooks/useReportForm';
import DocumentLinkDescription from './FormDescriptions/DocumentLinkDescription.tsx';

interface GoogleSheetsTargetSectionProps {
  form: UseFormReturn<ReportEditFormValues>;
  /** Destination a new sheet would be created in; empty until one is picked. */
  destinationId: string;
  /** Account that needs write access to the document. */
  accessEmail?: string;
  /** Names a sheet created before the report has a title of its own. */
  dataMartTitle?: string;
  inputId: string;
}

/**
 * Where a Google Sheets report writes: the spreadsheet tab, chosen by pasting its link or by
 * creating a new sheet in the selected destination.
 *
 * Kept apart from the form around it because this is the one part that belongs to a single
 * destination type. An Excel report renders no target at all — the add-in reads the report into
 * the worksheet it was opened from, so there is nothing to choose — and a destination that
 * later names a workbook of its own gets its own section rather than a branch inside this one.
 */
export function GoogleSheetsTargetSection({
  form,
  destinationId,
  accessEmail,
  dataMartTitle,
  inputId,
}: GoogleSheetsTargetSectionProps) {
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  const documentUrl = form.watch('documentUrl');
  const isValidDocumentUrl = documentUrl && isValidGoogleSheetsUrl(documentUrl.trim());

  const handleCreateGoogleSheet = async () => {
    if (!destinationId || isCreatingSheet) {
      return;
    }
    // The report has no title yet at creation time (defaults to DEFAULT_REPORT_TITLE),
    // so fall back to the Data Mart title; use the report title once the user set one.
    const reportTitle = form.getValues('title').trim();
    const sheetTitle =
      reportTitle && reportTitle !== DEFAULT_REPORT_TITLE
        ? reportTitle
        : (dataMartTitle ?? reportTitle);
    setIsCreatingSheet(true);
    try {
      const { spreadsheetId, sheetId, placedInRoot, sharedWithRequester } =
        await dataDestinationService.createGoogleSheetDocument(destinationId, {
          title: sheetTitle,
        });
      form.setValue('documentUrl', getGoogleSheetTabUrl(spreadsheetId, sheetId), {
        shouldDirty: true,
        shouldValidate: true,
      });
      // The backend explicitly flags a downgrade (folder dropped / not shared)
      // when the connected OAuth token lacks a Drive scope. Older backends omit
      // these flags (undefined), so only warn on an explicit true/false.
      if (placedInRoot === true || sharedWithRequester === false) {
        const issues: string[] = [];
        if (placedInRoot === true) {
          issues.push('the selected Drive folder was not used (it was created in your Drive root)');
        }
        if (sharedWithRequester === false) {
          issues.push('it was not shared with you');
        }
        toast(
          `Google Sheet created, but ${issues.join(', and ')}. Reconnect the destination’s ` +
            'Google account with Drive access to fix this.',
          { icon: '⚠️', duration: 8000 }
        );
      } else {
        toast.success('Google Sheet created');
      }
    } catch (error) {
      showApiErrorToast(error, 'Failed to create Google Sheet');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  return (
    <FormField
      control={form.control}
      name='documentUrl'
      render={({ field }) => (
        <FormItem>
          <FormLabel tooltip='The link must include the Sheet ID to insert data into the correct tab'>
            Document Link with Sheet ID (GID)
          </FormLabel>
          <FormControl>
            <div className='flex items-center gap-2'>
              <Input
                id={inputId}
                placeholder='Paste a Google Sheets URL'
                className='flex-1'
                {...field}
              />
              {isValidDocumentUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        window.open(documentUrl.trim(), '_blank', 'noopener,noreferrer');
                      }}
                      aria-label='Open document in new tab'
                    >
                      <ExternalLink className='h-3.5 w-3.5' strokeWidth={1.5} aria-hidden='true' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='center' role='tooltip'>
                    Open document
                  </TooltipContent>
                </Tooltip>
              )}
              {!isValidDocumentUrl && (
                <>
                  <span className='text-muted-foreground text-sm'>or</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type='button'
                        variant='outline'
                        className='flex-shrink-0'
                        disabled={!destinationId || isCreatingSheet}
                        onClick={() => void handleCreateGoogleSheet()}
                      >
                        {isCreatingSheet ? (
                          <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
                        ) : (
                          <Plus className='h-4 w-4' aria-hidden='true' />
                        )}
                        New Sheet
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side='top' align='center' role='tooltip'>
                      {destinationId
                        ? 'Create a new Google Sheet in the selected destination and fill the link above'
                        : 'Select a destination first'}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </FormControl>
          <FormDescription>
            <DocumentLinkDescription accessEmail={accessEmail} />
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
