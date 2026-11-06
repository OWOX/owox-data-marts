import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Blocks, KeyRound, RotateCcw, Server, Share2, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { normalizePluginCredentialRequirement } from '../../credentials';
import type { NormalizedPluginCredentialRequirement } from '../../credentials/types';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { GitHubIcon } from '../../../shared/icons';
import { useCredentialSelectionsForm } from '../hooks/useCredentialSelectionsForm';
import { repositoryPath } from '../repository';
import { safeHttpsUrl } from '../safeHttpsUrl';
import type { PluginGalleryEntry } from '../types';
import { DialogFact } from './DialogFact';
import { PluginCredentialFields } from './PluginCredentialFields';

interface InstallPluginDialogProps {
  plugin: PluginGalleryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (credentialSelections: Readonly<Record<string, string | null>>) => void;
  /** Opens the Credential creation flow preconfigured for this requirement. */
  onAddCredential?: (requirement: NormalizedPluginCredentialRequirement) => void;
  isInstalling: boolean;
}

/** Installing starts from no choice at all: every requirement needs the member's decision. */
const NO_SELECTIONS: Readonly<Record<string, string | null>> = Object.freeze({});

/**
 * Confirmation before a plugin gets the member's API authority.
 *
 * Deliberately not a second product page. What the plugin does, who wrote it and where it
 * came from live on the plugin's own page; this dialog only restates the three things a
 * member must accept before the plugin can act: it uses their access, data it reads can
 * leave OWOX, and uninstalling and installing again restores nothing the plugin kept on its
 * publisher's side.
 * A plugin nothing lists for the member adds a fourth: they are trusting its source alone.
 *
 * The name and current SemVer stay because §13 requires the installation screen to show
 * display metadata and the current version. Changing an installed plugin's Credentials is
 * no new act of trust and happens on its Credentials tab instead.
 */
export function InstallPluginDialog({
  plugin,
  open,
  onOpenChange,
  onConfirm,
  onAddCredential,
  isInstalling,
}: InstallPluginDialogProps) {
  const requirements = useMemo(
    () => (plugin.credentialRequirements ?? []).map(normalizePluginCredentialRequirement),
    [plugin.credentialRequirements]
  );
  // Every opening, and a stale-version retry, starts the choices over.
  const form = useCredentialSelectionsForm(
    requirements,
    NO_SELECTIONS,
    `${String(open)}:${plugin.currentVersionId ?? ''}`
  );
  // Source URLs are untrusted strings on the wire. Only absolute https becomes an href.
  const ownerHref = safeHttpsUrl(plugin.source.ownerUrl);
  const repositoryHref = safeHttpsUrl(plugin.source.repositoryUrl);
  const repoPath = repositoryHref ? repositoryPath(repositoryHref) : null;
  const isUnlisted = plugin.visibleViaScopes.length === 0;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Install this plugin?'
      description='Installing is personal. It does not change who else can find this plugin.'
      confirmLabel={isInstalling ? 'Installing…' : 'Install'}
      confirmDisabled={
        isInstalling || form.credentialsLoading || form.credentialsFailed || form.missingDecision
      }
      variant='outline'
      onConfirm={() => {
        onConfirm(form.submission);
      }}
    >
      <div className='flex min-w-0 flex-col gap-4 overflow-hidden text-sm'>
        {/* What is being installed, styled as the Gallery card it came from. */}
        <div className='bg-card flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border p-4'>
          <div className='flex min-w-0 items-center gap-3 overflow-hidden'>
            {/* Placeholder mark, as on the Gallery card: plugin.json carries no icon yet. */}
            <div className='bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md'>
              <Blocks className='size-6' aria-hidden />
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-1 overflow-hidden'>
              {/* title= is the full value once CSS truncates the visible label. */}
              <span className='truncate font-medium' title={plugin.displayName}>
                {plugin.displayName}
              </span>

              {/*
                One line of provenance: version, who wrote it, where it came from.

                Deliberately not flex-wrap. An owner name and an owner/name path are both
                publisher-controlled and can be arbitrarily long; wrapping would push the
                dialog taller on exactly the plugins whose provenance matters least. Long
                values ellipsise (min-w-0 + truncate on every flexible piece); title=
                keeps the full string reachable on hover.
              */}
              <span className='text-muted-foreground flex min-w-0 items-center gap-1.5 overflow-hidden text-xs'>
                <span className='shrink-0' data-testid='install-version'>
                  {plugin.currentSemver ? `v${plugin.currentSemver}` : 'No version'}
                </span>

                {/* §16: the owner is always disclosed. */}
                <span className='shrink-0' aria-hidden>
                  ·
                </span>
                {ownerHref ? (
                  <ExternalAnchor
                    href={ownerHref}
                    className='max-w-[40%] min-w-0 overflow-hidden'
                    title={plugin.source.ownerName}
                  >
                    {plugin.source.ownerName}
                  </ExternalAnchor>
                ) : (
                  <span className='max-w-[40%] min-w-0 truncate' title={plugin.source.ownerName}>
                    {plugin.source.ownerName}
                  </span>
                )}

                {/* §16: withheld for a private repository -- naming it would confirm that
                    one specific private repository exists. */}
                {repositoryHref && repoPath && (
                  <>
                    <span className='shrink-0' aria-hidden>
                      ·
                    </span>
                    <span className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden'>
                      <GitHubIcon size={12} className='shrink-0' aria-hidden />
                      <ExternalAnchor
                        href={repositoryHref}
                        className='min-w-0 flex-1 overflow-hidden'
                        title={repoPath}
                      >
                        {repoPath}
                      </ExternalAnchor>
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/*
          Authoring guide / §14 trust boundary: sandbox protects credentials, not data the
          plugin is authorised to read. Every line here must be plain before Install.
        */}
        <div
          className='flex flex-col gap-3 rounded-md border p-3'
          data-testid='install-data-notice'
        >
          {isUnlisted && (
            <DialogFact icon={ShieldAlert}>
              This plugin isn't listed for you. Install it only if you trust{' '}
              {repoPath ? (
                <span className='break-words'>{repoPath}</span>
              ) : (
                'whoever sent you the link'
              )}
              .
            </DialogFact>
          )}
          <DialogFact icon={KeyRound}>Acts with your access to OWOX Data Marts.</DialogFact>
          {plugin.backendOrigin && (
            <DialogFact icon={Server}>
              Runs code on <span className='break-words'>{plugin.backendOrigin}</span> with your
              access, including when the plugin is closed.
            </DialogFact>
          )}
          <DialogFact icon={Share2}>
            Anything it reads can leave OWOX and reach the plugin publisher.
          </DialogFact>
          <DialogFact icon={RotateCcw}>
            Uninstalling and installing again restores nothing the plugin kept on its publisher's
            side.
          </DialogFact>
        </div>

        {requirements.length > 0 && (
          <div className='flex flex-col gap-3 rounded-md border p-3'>
            <div>
              <div className='font-medium'>Credentials</div>
              <p className='text-muted-foreground text-xs'>
                Choose which project Credential this plugin may use. The secret is never shown to
                the plugin.
              </p>
            </div>
            <PluginCredentialFields form={form} onAddCredential={onAddCredential} />
          </div>
        )}
      </div>
    </ConfirmationDialog>
  );
}
