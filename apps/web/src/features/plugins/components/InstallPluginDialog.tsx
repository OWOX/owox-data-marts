import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { Blocks, KeyRound, Plus, RotateCcw, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CredentialConfigSheet,
  isCredentialEligible,
  normalizePluginCredentialRequirement,
  useCredentialDefinitions,
  useCredentials,
} from '../../credentials';
import type { NormalizedPluginCredentialRequirement } from '../../credentials/types';
import type { Credential } from '../../credentials';
import { Combobox, type ComboboxOption } from '../../../shared/components/Combobox/combobox';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { GitHubIcon } from '../../../shared/icons';
import { repositoryPath } from '../repository';
import { safeHttpsUrl } from '../safeHttpsUrl';
import type { PluginGalleryEntry } from '../types';

interface InstallPluginDialogProps {
  plugin: PluginGalleryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (credentialSelections: Readonly<Record<string, string | null>>) => void;
  /** Opens the Credential creation flow preconfigured for this requirement. */
  onAddCredential?: (requirement: NormalizedPluginCredentialRequirement) => void;
  isInstalling: boolean;
  mode?: 'install' | 'configure';
}

const DO_NOT_GRANT_VALUE = '__none__';
const ADD_CREDENTIAL_VALUE = '__add_credential__';

/**
 * Confirmation before a plugin gets the member's API authority.
 *
 * Deliberately not a second product page. What the plugin does, who wrote it and where it
 * came from live on the plugin's own page; this dialog only restates the three things a
 * member must accept before the plugin can act: it uses their access, data it reads can
 * leave OWOX, and reinstalling restores nothing the plugin kept on its own side.
 *
 * The name and current SemVer stay because §13 requires the installation screen to show
 * display metadata and the current version.
 */
export function InstallPluginDialog({
  plugin,
  open,
  onOpenChange,
  onConfirm,
  onAddCredential,
  isInstalling,
  mode = 'install',
}: InstallPluginDialogProps) {
  const { credentials, isLoading: credentialsLoading } = useCredentials();
  const { definitions, isLoading: definitionsLoading } = useCredentialDefinitions();
  const [selections, setSelections] = useState<Partial<Record<string, string | null>>>({});
  const [touchedRequirements, setTouchedRequirements] = useState<ReadonlySet<string>>(new Set());
  const [inlineCredentials, setInlineCredentials] = useState<Credential[]>([]);
  const [creatingRequirement, setCreatingRequirement] =
    useState<NormalizedPluginCredentialRequirement | null>(null);
  const requirements = useMemo(
    () => (plugin.credentialRequirements ?? []).map(normalizePluginCredentialRequirement),
    [plugin.credentialRequirements]
  );
  useEffect(() => {
    if (open) {
      setSelections({});
      setTouchedRequirements(new Set());
      setInlineCredentials([]);
    }
  }, [open, plugin.currentVersionId]);
  const availableCredentials = useMemo(
    () => [
      ...credentials,
      ...inlineCredentials.filter(
        inline => !credentials.some(credential => credential.id === inline.id)
      ),
    ],
    [credentials, inlineCredentials]
  );
  const missingDecision = requirements.some(
    requirement => !Object.prototype.hasOwnProperty.call(selections, requirement.key)
  );
  const allowedDefinitionIds = useMemo(
    () => (creatingRequirement ? compatibleDefinitionIds(creatingRequirement, definitions) : []),
    [creatingRequirement, definitions]
  );
  // Source URLs are untrusted strings on the wire. Only absolute https becomes an href.
  const ownerHref = safeHttpsUrl(plugin.source.ownerUrl);
  const repositoryHref = safeHttpsUrl(plugin.source.repositoryUrl);
  const repoPath = repositoryHref ? repositoryPath(repositoryHref) : null;
  const isConfiguring = mode === 'configure';

  return (
    <>
      <ConfirmationDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isConfiguring ? 'Configure plugin Credentials?' : 'Install this plugin?'}
        description={
          isConfiguring
            ? 'Choose which project Credentials this installed plugin may use.'
            : 'Installing is personal. It does not change who else can find this plugin.'
        }
        confirmLabel={
          isInstalling
            ? isConfiguring
              ? 'Saving…'
              : 'Installing…'
            : isConfiguring
              ? 'Save'
              : 'Install'
        }
        confirmDisabled={isInstalling || credentialsLoading || missingDecision}
        variant='outline'
        onConfirm={() => {
          onConfirm(toCredentialSelections(selections));
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
          plugin is authorised to read. All three must be plain before Install.
        */}
          <div
            className='flex flex-col gap-3 rounded-md border p-3'
            data-testid='install-data-notice'
          >
            <Fact icon={<KeyRound className='size-4 shrink-0' aria-hidden />}>
              Acts with your access to OWOX Data Marts.
            </Fact>
            <Fact icon={<Share2 className='size-4 shrink-0' aria-hidden />}>
              Anything it reads can leave OWOX and reach the plugin publisher.
            </Fact>
            <Fact icon={<RotateCcw className='size-4 shrink-0' aria-hidden />}>
              {isConfiguring
                ? 'Changing Credential access does not reinstall or clear plugin data.'
                : 'Reinstalling restores nothing the plugin kept on its own side.'}
            </Fact>
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
              {requirements.map(requirement => {
                const eligible = availableCredentials.filter(credential =>
                  isCredentialEligible(credential, requirement)
                );
                const selected = selections[requirement.key];
                const hasDecision = Object.prototype.hasOwnProperty.call(
                  selections,
                  requirement.key
                );
                const showSelectionError =
                  touchedRequirements.has(requirement.key) && !hasDecision && eligible.length > 0;
                const presentation = getRequirementPresentation(
                  requirement,
                  definitions,
                  availableCredentials
                );
                const canAddCredential =
                  Boolean(onAddCredential) ||
                  (!definitionsLoading &&
                    compatibleDefinitionIds(requirement, definitions).length > 0);
                const credentialOptions: ComboboxOption[] = [
                  ...(requirement.optional
                    ? [{ value: DO_NOT_GRANT_VALUE, label: 'Do not grant' }]
                    : []),
                  ...eligible.map(credential => ({
                    value: credential.id,
                    label: `${credential.title} · ${credential.definition.displayName}`,
                  })),
                  ...(canAddCredential
                    ? [
                        {
                          value: ADD_CREDENTIAL_VALUE,
                          label: 'Add Credential',
                          separator: requirement.optional || eligible.length > 0,
                        },
                      ]
                    : []),
                ];
                return (
                  <div key={requirement.key} className='flex flex-col gap-1.5'>
                    <span className='flex items-baseline gap-1 text-sm font-medium'>
                      <span>{presentation.label}</span>
                      {requirement.optional && (
                        <span className='text-muted-foreground font-normal'>(optional)</span>
                      )}
                    </span>
                    <span className='text-muted-foreground text-xs'>{presentation.providers}</span>
                    <Combobox
                      value={selected === null ? DO_NOT_GRANT_VALUE : (selected ?? '')}
                      options={credentialOptions}
                      disabled={
                        credentialsLoading ||
                        (!requirement.optional && eligible.length === 0 && !canAddCredential)
                      }
                      ariaLabel={`Select ${presentation.label} Credential`}
                      ariaInvalid={showSelectionError}
                      placeholder={credentialsLoading ? 'Loading...' : 'Select a Credential'}
                      emptyMessage='No enabled matching Credentials found'
                      className='w-full'
                      onOpenChange={isOpen => {
                        if (!isOpen) {
                          setTouchedRequirements(current => new Set(current).add(requirement.key));
                        }
                      }}
                      onValueChange={value => {
                        if (value === ADD_CREDENTIAL_VALUE) {
                          if (onAddCredential) {
                            onAddCredential(requirement);
                          } else {
                            setCreatingRequirement(requirement);
                          }
                          return;
                        }
                        setSelections(current => ({
                          ...current,
                          [requirement.key]: value === DO_NOT_GRANT_VALUE ? null : value,
                        }));
                      }}
                      renderLabel={option =>
                        option.value === ADD_CREDENTIAL_VALUE ? (
                          <div className='flex min-w-0 flex-1 items-center gap-2'>
                            <div className='flex h-6 w-6 items-center justify-center'>
                              <Plus size={16} />
                            </div>
                            <span className='min-w-0 truncate'>{option.label}</span>
                          </div>
                        ) : (
                          <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                        )
                      }
                    />
                    {showSelectionError && (
                      <span className='text-destructive text-xs' role='alert'>
                        {requirement.optional
                          ? 'Choose a Credential or Do not grant.'
                          : 'Select a Credential to continue.'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ConfirmationDialog>
      {creatingRequirement && (
        <CredentialConfigSheet
          key={`${plugin.currentVersionId ?? 'no-version'}:${creatingRequirement.key}`}
          isOpen
          credential={null}
          definitions={definitions}
          allowedDefinitionIds={allowedDefinitionIds}
          initialDefinitionId={creatingRequirement.definitionId ?? allowedDefinitionIds[0]}
          onClose={() => {
            setCreatingRequirement(null);
          }}
          onCreated={created => {
            if (!isCredentialEligible(created, creatingRequirement)) return;
            setInlineCredentials(current => [...current, created]);
            setSelections(current => ({
              ...current,
              [creatingRequirement.key]: created.id,
            }));
            setTouchedRequirements(current => new Set(current).add(creatingRequirement.key));
          }}
        />
      )}
    </>
  );
}

function compatibleDefinitionIds(
  requirement: NormalizedPluginCredentialRequirement,
  definitions: readonly {
    id: string;
    supportsAi: boolean;
    ai: { recommended?: Partial<Record<'fast' | 'reasoning' | 'embedding', string>> } | null;
  }[]
): string[] {
  if (requirement.definitionId !== null) {
    return definitions
      .filter(definition => definition.id === requirement.definitionId)
      .map(definition => definition.id);
  }

  return definitions
    .filter(
      definition =>
        definition.supportsAi &&
        requirement.models.every(model =>
          Boolean(
            definition.ai?.recommended?.[
              model as keyof NonNullable<typeof definition.ai>['recommended']
            ]
          )
        )
    )
    .map(definition => definition.id);
}

function getRequirementPresentation(
  requirement: NormalizedPluginCredentialRequirement,
  definitions: readonly { id: string; displayName: string; supportsAi: boolean }[],
  credentials: readonly {
    definition: { id: string; displayName: string; supportsAi: boolean };
  }[]
): { label: string; providers: string } {
  const availableDefinitions = [
    ...definitions,
    ...credentials.map(credential => credential.definition),
  ];

  if (requirement.definitionId !== null) {
    const definition = availableDefinitions.find(item => item.id === requirement.definitionId);
    const providerName = definition?.displayName ?? humanizeIdentifier(requirement.definitionId);
    return {
      label: definition?.displayName ?? humanizeIdentifier(requirement.key),
      providers: `Provider: ${providerName}`,
    };
  }

  const providerNames = [
    ...new Set(
      availableDefinitions
        .filter(definition => definition.supportsAi)
        .map(definition => definition.displayName)
    ),
  ];

  return {
    label: requirement.key.toLowerCase() === 'ai' ? 'AI' : humanizeIdentifier(requirement.key),
    providers:
      providerNames.length > 0
        ? `Allowed providers: ${providerNames.join(', ')}`
        : 'Allowed providers: any AI-capable Credential',
  };
}

function humanizeIdentifier(value: string): string {
  const words = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!words) return 'Credential';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function toCredentialSelections(
  selections: Readonly<Partial<Record<string, string | null>>>
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(selections).filter(
      (entry): entry is [string, string | null] => entry[1] !== undefined
    )
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className='text-muted-foreground flex items-start gap-2'>
      <span className='mt-0.5'>{icon}</span>
      <p className='min-w-0'>{children}</p>
    </div>
  );
}
