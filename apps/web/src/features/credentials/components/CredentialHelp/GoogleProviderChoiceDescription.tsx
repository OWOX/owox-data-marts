import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with a brief explanation of the Google providers the form offers.
 */
export default function GoogleProviderChoiceDescription({
  definitionIds,
}: {
  definitionIds: readonly string[];
}) {
  const offers = (id: string) => definitionIds.includes(id);
  const storagePair =
    definitionIds.length === 2 && offers('google-oauth') && offers('google-service-account');
  // The Sheets Destination form offers this pair; BigQuery roles mean nothing there.
  const sheetsPair =
    definitionIds.length === 2 && offers('google-sheets-oauth') && offers('google-service-account');
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='google-auth-method-details'>
        <AccordionTrigger>Which provider should I choose?</AccordionTrigger>
        <AccordionContent>
          {storagePair && <p className='mb-2'>BigQuery supports two authentication methods:</p>}
          <div className='space-y-3 text-sm'>
            {offers('google-oauth') && (
              <div>
                <strong className='font-medium'>BigQuery Google account (OAuth):</strong>
                <p className='mt-1'>
                  The quickest way to get started. Sign in with your Google account and grant access
                  to BigQuery in a few clicks.
                  {storagePair && ' Best for most users.'}
                </p>
              </div>
            )}
            {offers('google-sheets-oauth') && (
              <div>
                <strong className='font-medium'>Sheets Google account (OAuth):</strong>
                <p className='mt-1'>
                  The quickest way to get started. Sign in with your Google account and grant access
                  to Google Sheets in a few clicks.
                </p>
              </div>
            )}
            {offers('google-service-account') && (
              <div>
                <strong className='font-medium'>Google Service Account:</strong>
                <p className='mt-1'>
                  {storagePair
                    ? 'Uses a Google Cloud service account key for server-to-server authentication. Recommended when you need unattended access without a personal Google account, or when your organization requires service accounts for compliance.'
                    : 'Uses a Google Cloud service account key for server-to-server authentication. It fits both BigQuery Storages and Google Sheets Destinations. Recommended when you need unattended access without a personal Google account, or when your organization requires service accounts for compliance.'}
                </p>
              </div>
            )}
            {offers('google-chat-webhook') && (
              <div>
                <strong className='font-medium'>Google Chat webhook:</strong>
                <p className='mt-1'>
                  An incoming webhook URL of a Google Chat space, used by Google Chat Destinations.
                </p>
              </div>
            )}
          </div>
          {!sheetsPair && (offers('google-oauth') || offers('google-service-account')) && (
            <p className='mt-3 text-sm'>
              {storagePair ? 'Whichever provider you choose' : 'For BigQuery'}, the account
              (personal or service account) needs the <strong>BigQuery Data Editor</strong> (
              <code>roles/bigquery.dataEditor</code>) and <strong>BigQuery Job User</strong> (
              <code>roles/bigquery.jobUser</code>) roles on the target Google Cloud project.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
