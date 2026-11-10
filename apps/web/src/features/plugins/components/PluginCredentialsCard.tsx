import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { KeyRound, Loader2, RotateCcw, Server, Share2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { normalizePluginCredentialRequirement } from '../../credentials';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import { grantedCredentialSelections } from '../credentialRequirements';
import { useCredentialSelectionsForm } from '../hooks/useCredentialSelectionsForm';
import type { PluginGalleryEntry } from '../types';
import { DialogFact } from './DialogFact';
import { PluginCredentialFields } from './PluginCredentialFields';

export type CredentialsSaveOutcome = 'saved' | 'stale' | 'failed';

interface PluginCredentialsCardProps {
  plugin: PluginGalleryEntry;
  /** The installation's current grants; undefined while loading or when they could not be read. */
  granted: Readonly<Record<string, string>> | undefined;
  grantsState: 'loading' | 'failed' | 'loaded';
  isSaving: boolean;
  disabled: boolean;
  onSave: (
    credentialSelections: Readonly<Record<string, string | null>>
  ) => Promise<CredentialsSaveOutcome>;
}

/**
 * The plugin's Credentials tab: which Credential each requirement is granted, changed in
 * place. No confirmation dialog: the member agreed to trust the plugin when installing it,
 * and a grant changed here is changed back the same way.
 */
export function PluginCredentialsCard({
  plugin,
  granted,
  grantsState,
  isSaving,
  disabled,
  onSave,
}: PluginCredentialsCardProps) {
  const requirements = useMemo(
    () => (plugin.credentialRequirements ?? []).map(normalizePluginCredentialRequirement),
    [plugin.credentialRequirements]
  );
  const initialSelections = useMemo(
    () => grantedCredentialSelections(requirements, granted),
    [requirements, granted]
  );
  // Saved grants arriving start the form over. A newer version keeps the member's choices
  // unless its requirements changed: query results keep their references while equal.
  const form = useCredentialSelectionsForm(requirements, initialSelections, plugin.pluginId);
  const [staleVersion, setStaleVersion] = useState(false);

  const save = async () => {
    const outcome = await onSave(form.submission);
    setStaleVersion(outcome === 'stale');
  };

  return (
    <CollapsibleCard collapsible name='plugin-credentials'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={KeyRound}
          tooltip='Which project Credentials this plugin may use'
        >
          Credentials
        </CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        {/* A settings form, as on the Data Mart and project settings pages: fields, what they
            mean, then Save and Discard. Capped so a wide screen does not stretch the pickers. */}
        <div className='flex max-w-3xl flex-col gap-4 text-sm'>
          {grantsState === 'loading' ? (
            <p className='text-muted-foreground'>Loading…</p>
          ) : (
            <>
              {grantsState === 'failed' && (
                <p className='text-destructive' role='alert'>
                  Could not load the Credentials this plugin is granted now. Choose them again to
                  save.
                </p>
              )}
              {staleVersion && (
                <p
                  className='text-muted-foreground rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2'
                  role='status'
                >
                  A newer version of this plugin arrived, so nothing was saved. Review the
                  Credentials and save again.
                </p>
              )}
              <PluginCredentialFields form={form} disabled={isSaving || disabled} tiles />
            </>
          )}

          {/* What a grant lets the plugin do: the parts of the install notice about Credentials. */}
          <div className='flex flex-col gap-2 py-2' data-testid='credentials-access-notice'>
            <DialogFact icon={ShieldCheck}>
              The plugin uses these Credentials through OWOX and never sees their secrets.
            </DialogFact>
            {plugin.backendOrigin && (
              <DialogFact icon={Server}>
                Its code on <span className='break-words'>{plugin.backendOrigin}</span> can use them
                with your access, including when the plugin is closed.
              </DialogFact>
            )}
            <DialogFact icon={Share2}>
              Anything it reads with them can leave OWOX and reach the plugin publisher.
            </DialogFact>
            <DialogFact icon={RotateCcw}>
              Changing Credential access does not clear plugin data.
            </DialogFact>
          </div>

          {grantsState !== 'loading' && (
            <div className='flex items-center gap-4'>
              <Button
                disabled={
                  !form.isDirty ||
                  isSaving ||
                  disabled ||
                  form.credentialsLoading ||
                  form.credentialsFailed ||
                  form.owoxAiLoading ||
                  form.missingDecision
                }
                onClick={() => void save()}
                aria-busy={isSaving}
                className='inline-grid'
              >
                {/* The label only turns transparent under the spinner, so it keeps the button's size
                    and Discard does not shift when saving starts. The spinner sits in a span: an svg
                    child would trigger the Button's has-[>svg]:px-3 and narrow it. */}
                <span className={cn('col-start-1 row-start-1', isSaving && 'opacity-0')}>Save</span>
                {isSaving && (
                  <span className='col-start-1 row-start-1 flex place-self-center'>
                    <Loader2 className='size-4 animate-spin' aria-hidden />
                  </span>
                )}
              </Button>
              <Button variant='ghost' disabled={!form.isDirty || isSaving} onClick={form.reset}>
                Discard
              </Button>
            </div>
          )}
        </div>
      </CollapsibleCardContent>
      <CollapsibleCardFooter />
    </CollapsibleCard>
  );
}
