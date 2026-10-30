import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import type { ConnectorSpecificationResponseApiDto } from '../../../../shared/api';
import { ConnectorVersionControl } from '../../ConnectorDefinitionField/ConnectorVersionControl';
import { StepperHeroBlock } from '../components';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepHero,
  AppWizardStepLoading,
} from '@owox/ui/components/common/wizard';
import { OpenIssueLink } from '../components';
import { Unplug } from 'lucide-react';
import { SECRET_MASK } from '../../../../../../shared/constants/secrets';
import { ConfigurationListRender } from './ConfigurationStep/ConfigurationListRender';
import {
  ConnectorCredentialField,
  CredentialsLoadError,
} from './ConfigurationStep/ConnectorCredentialField';
import { AUTH_TYPE, bundledKeyNames } from './ConfigurationStep/connector-credential-keys';
import { DataMartContext } from '../../../../../data-marts/edit/model/context/context';
import { ConnectorBuilderApiService } from '../../../../../connector-builder/shared/api/connector-builder-api.service';
import type {
  CredentialRequirementDto,
  FittingCredentialsQuery,
} from '../../../../../connector-builder/shared/api/types';
import { hasMeaningfulValue } from '../../../../shared/utils/dynamic-options.utils';
import { trackEvent } from '../../../../../../utils';
import { connectorSetupProperties } from '../../../../shared/model/connector-setup-analytics';
import { ConnectorSpecificationAttribute } from '../../../../shared/enums/connector-specification-attribute.enum';
import {
  GOOGLE_SHEETS_CONNECTOR_NAME,
  hasValidGoogleSheetsServiceAccountConfiguration,
} from '../../../../shared/utils/google-sheets-fields.utils';

interface ConfigurationStepProps {
  connector: ConnectorListItem;
  connectorSpecification: ConnectorSpecificationResponseApiDto[] | null;
  /** `automatic`: a Credential picked for the user, which alone does not make the form dirty. */
  onConfigurationChange?: (configuration: Record<string, unknown>, automatic?: boolean) => void;
  onValidationChange?: (isValid: boolean) => void;
  initialConfiguration?: Record<string, unknown>;
  loading?: boolean;
  isEditingExisting?: boolean;
  disabled?: boolean;
  /** The pin submitted for this source's version (undefined = follow active).
   * Passed by the first-time "Set Up Connector" wizard and when editing a saved
   * configuration — omitted when adding another configuration to a source, where
   * the version is fixed at the source level and must not be re-picked. */
  pinnedVersion?: number;
  /** Present only when the version is user-choosable at this call site; its mere
   * presence is what gates rendering ConnectorVersionControl below. */
  onChangeVersion?: (version?: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTopLevelMigrationTarget(spec: ConnectorSpecificationResponseApiDto): boolean {
  const attributes = spec.attributes ?? [];

  return (
    !spec.oneOf &&
    spec.name !== 'Fields' &&
    !attributes.includes(ConnectorSpecificationAttribute.DEPRECATED) &&
    !attributes.includes(ConnectorSpecificationAttribute.HIDE_IN_CONFIG_FORM)
  );
}

function migrateNestedConfigValuesToTopLevel(
  config: Record<string, unknown>,
  specs: ConnectorSpecificationResponseApiDto[]
): Record<string, unknown> {
  const nextConfig = { ...config };
  const topLevelFields = specs.filter(isTopLevelMigrationTarget).map(spec => spec.name);

  for (const spec of specs) {
    if (!spec.oneOf) continue;

    const oneOfConfig = nextConfig[spec.name];
    if (!isRecord(oneOfConfig)) continue;

    for (const optionConfig of Object.values(oneOfConfig)) {
      if (!isRecord(optionConfig)) continue;

      for (const fieldName of topLevelFields) {
        if (nextConfig[fieldName] !== undefined) continue;
        if (Object.prototype.hasOwnProperty.call(optionConfig, fieldName)) {
          nextConfig[fieldName] = optionConfig[fieldName];
        }
      }
    }
  }

  return nextConfig;
}

/**
 * Builds the form state from a configuration handed in by the parent: nested
 * values are migrated to the top level, spec defaults and the first option of a
 * `oneOf` field fill what is unset, and secrets of a saved configuration are
 * masked. Every (re)seed goes through here, so a rule added to it applies both
 * to a fresh and to an existing configuration.
 */
const isSecretSpec = (spec: ConnectorSpecificationResponseApiDto) =>
  Array.isArray(spec.attributes) && spec.attributes.includes('SECRET');

/**
 * The secrets a saved configuration has a value for. A version picked while editing can add a
 * secret with nothing stored behind it; masking that one made it pass as set, and the mask was
 * dropped on save, so every run failed on the empty value.
 */
function savedSecretNames(
  initialConfiguration: Record<string, unknown> | undefined,
  specs: ConnectorSpecificationResponseApiDto[]
): Set<string> {
  const config = migrateNestedConfigValuesToTopLevel({ ...(initialConfiguration ?? {}) }, specs);
  return new Set(
    specs.filter(spec => isSecretSpec(spec) && config[spec.name] !== undefined).map(s => s.name)
  );
}

function seedConfiguration(
  initialConfiguration: Record<string, unknown> | undefined,
  specs: ConnectorSpecificationResponseApiDto[],
  isEditingExisting: boolean,
  keyNames: ReadonlySet<string>
): Record<string, unknown> {
  const config = migrateNestedConfigValuesToTopLevel({ ...(initialConfiguration ?? {}) }, specs);
  const saved = savedSecretNames(initialConfiguration, specs);

  specs.forEach(spec => {
    const isSecret = isSecretSpec(spec);

    // A key value comes from the Credential, never from a default; a hidden key keeps its default on the typed path.
    if (config[spec.name] === undefined && spec.default !== undefined && !keyNames.has(spec.name)) {
      config[spec.name] = spec.default;
    }

    // The oneOf renderer seeds its first option in a mount effect too, but that
    // write lands before the seeding below replaces the state and is lost,
    // leaving the field unset until the user touches it.
    const firstOption = spec.oneOf?.[0]?.value;
    if (config[spec.name] === undefined && firstOption) {
      config[spec.name] = { [firstOption]: {} };
    }

    if (isEditingExisting && isSecret && saved.has(spec.name)) {
      config[spec.name] = SECRET_MASK;
    }
  });

  return config;
}

const credentialIdOf = (config: Record<string, unknown> | undefined) =>
  typeof config?._credential_id === 'string' ? config._credential_id : null;

/** A saved configuration not yet moved to a Credential, still running on the key it holds. */
function holdsOldKey(config: Record<string, unknown>, keyNames: ReadonlySet<string>): boolean {
  if (credentialIdOf(config) || !config._id) return false;
  return '_secrets_id' in config || [...keyNames].some(name => hasMeaningfulValue(config[name]));
}

export function ConfigurationStep({
  connector,
  connectorSpecification,
  onConfigurationChange,
  onValidationChange,
  initialConfiguration,
  loading = false,
  isEditingExisting = false,
  disabled = false,
  pinnedVersion,
  onChangeVersion,
}: ConfigurationStepProps) {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  const initializedRef = useRef(false);
  // The object a seed put in state: it is the parent's configuration, not an edit to report.
  const seededConfigRef = useRef<Record<string, unknown> | null>(null);
  // The Credential field mounts after the seed, so a Credential it picks is not overwritten by it.
  const [seeded, setSeeded] = useState(false);
  const autoSelectedRef = useRef(false);
  // The exact object last reported upwards. The wizard stores it as-is and hands it
  // straight back as `initialConfiguration`, so reference equality identifies our
  // own echo and distinguishes it from a genuine outside change.
  const lastEchoedConfigRef = useRef<Record<string, unknown> | null>(null);
  const [secretEditing, setSecretEditing] = useState<Record<string, boolean>>({});
  // Taken when a configuration is seeded, not from the echo of each edit: clicking Edit empties
  // a stored secret, which must not turn it into one with nothing stored.
  const [storedSecrets, setStoredSecrets] = useState<ReadonlySet<string>>(new Set());
  const [managedOAuthModes, setManagedOAuthModes] = useState<Partial<Record<string, boolean>>>({});
  // A restricted Credential is not in the list, so its own id must not be shown as a selection.
  const [seededCredentialId, setSeededCredentialId] = useState<string | null>(null);
  const dataMart = useContext(DataMartContext)?.dataMart;

  // A custom connector's key parameters, as the server parses the version the Data Mart runs.
  const requirementKey = connector.isCustom
    ? JSON.stringify({
        connectorName: connector.name,
        ...(pinnedVersion !== undefined ? { version: pinnedVersion } : {}),
      })
    : null;
  const [requirement, setRequirement] = useState<{
    key: string;
    value: CredentialRequirementDto | null;
  } | null>(null);
  const [requirementAttempt, setRequirementAttempt] = useState(0);
  useEffect(() => {
    if (!requirementKey) return;
    let cancelled = false;
    void new ConnectorBuilderApiService()
      .credentialRequirement(JSON.parse(requirementKey) as FittingCredentialsQuery)
      .catch(() => null)
      .then(value => {
        if (!cancelled) setRequirement({ key: requirementKey, value });
      });
    return () => {
      cancelled = true;
    };
  }, [requirementKey, requirementAttempt]);
  const requirementLoading = requirementKey !== null && requirement?.key !== requirementKey;
  const customKeys = requirement?.key === requirementKey ? requirement.value : null;
  // A custom connector's keys come from the server's parse only: none are guessed while it is missing.
  const keysUnknown = requirementKey !== null && customKeys === null;
  // Every key parameter, hidden ones too: none is ever sent beside a Credential.
  const allKeyNames = useMemo(
    () =>
      new Set(
        requirementKey
          ? (customKeys?.keyParameters ?? [])
          : bundledKeyNames(connectorSpecification ?? [])
      ),
    [connectorSpecification, customKeys, requirementKey]
  );
  // Only the fields the form shows: a hidden key (a rotated token) is never typed.
  const keyNames = useMemo(() => {
    const shown = (connectorSpecification ?? []).filter(
      spec => !spec.attributes?.includes(ConnectorSpecificationAttribute.HIDE_IN_CONFIG_FORM)
    );
    return new Set([...allKeyNames].filter(name => shown.some(spec => spec.name === name)));
  }, [connectorSpecification, allKeyNames]);

  useEffect(() => {
    trackEvent({
      event: 'connector_setup',
      category: connector.name,
      action: 'connector_selected',
      label: connector.displayName,
      ...connectorSetupProperties(connector, pinnedVersion),
    });
    // Once per connector picked: a pin made afterwards is reported when the Data Mart is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector]);

  useEffect(() => {
    // `initialConfiguration` is a dependency so a genuinely new configuration seeds
    // the form, but our own echo must not: re-seeding from it discarded characters
    // as they were typed, which is why input appeared to lag a keystroke behind.
    if (connectorSpecification && initialConfiguration !== lastEchoedConfigRef.current) {
      seededConfigRef.current = seedConfiguration(
        initialConfiguration,
        connectorSpecification,
        isEditingExisting,
        credentialIdOf(initialConfiguration) !== null ? allKeyNames : keyNames
      );
      setConfiguration(seededConfigRef.current);
      setStoredSecrets(savedSecretNames(initialConfiguration, connectorSpecification));
      setSeededCredentialId(credentialIdOf(initialConfiguration));
      initializedRef.current = true;
      setSeeded(true);
    }
  }, [connectorSpecification, initialConfiguration, isEditingExisting, allKeyNames, keyNames]);

  useEffect(() => {
    if (
      initializedRef.current &&
      initialConfiguration &&
      Object.keys(initialConfiguration).length > 0 &&
      connectorSpecification &&
      // Ignore our own echo. It is always at least one keystroke behind local
      // state, so re-applying it here overwrote characters as they were typed.
      initialConfiguration !== lastEchoedConfigRef.current
    ) {
      // Same seeding as above: this effect runs after it in the same flush and
      // wins, so re-applying the raw configuration here would drop the defaults,
      // the oneOf seed and the secret mask again.
      seededConfigRef.current = seedConfiguration(
        initialConfiguration,
        connectorSpecification,
        isEditingExisting,
        credentialIdOf(initialConfiguration) !== null ? allKeyNames : keyNames
      );
      setConfiguration(seededConfigRef.current);
      setStoredSecrets(savedSecretNames(initialConfiguration, connectorSpecification));
      setSeededCredentialId(credentialIdOf(initialConfiguration));
    }
  }, [initialConfiguration, connectorSpecification, isEditingExisting, allKeyNames, keyNames]);

  useEffect(() => {
    if (
      initializedRef.current &&
      configuration !== seededConfigRef.current &&
      // A re-created callback gets nothing new: reporting again would drop an automatic pick's flag.
      configuration !== lastEchoedConfigRef.current &&
      Object.keys(configuration).length > 0
    ) {
      lastEchoedConfigRef.current = configuration;
      const automatic = autoSelectedRef.current;
      autoSelectedRef.current = false;
      if (automatic) onConfigurationChange?.(configuration, true);
      else onConfigurationChange?.(configuration);
    }
  }, [configuration, onConfigurationChange]);

  const handleValueChange = (name: string, value: unknown) => {
    setConfiguration(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleManagedOAuthModeChange = useCallback(
    (specificationName: string, isManaged: boolean) => {
      setManagedOAuthModes(current => {
        if (current[specificationName] === isManaged) return current;
        return { ...current, [specificationName]: isManaged };
      });
    },
    []
  );

  const validateValue = useCallback(
    (value: unknown, spec?: ConnectorSpecificationResponseApiDto): boolean => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (typeof value === 'number') {
        if (isNaN(value)) return false;
        if (spec?.minimum !== undefined && value < spec.minimum) return false;
      }
      if (Array.isArray(value) && value.length === 0) return false;

      return true;
    },
    []
  );

  const validateOneOfRecursive = useCallback(
    (value: unknown, spec: ConnectorSpecificationResponseApiDto): boolean => {
      if (typeof value !== 'object' || value === null) return validateValue(value, spec);

      if (spec.attributes?.includes('OAUTH_FLOW') && '_source_credential_id' in value) {
        return true;
      }

      const oneOfs = spec.oneOf?.filter(
        oneOf => oneOf.value === Object.keys(value as Record<string, unknown>)[0]
      );
      if (oneOfs) {
        return oneOfs.every(oneOf => {
          if (oneOf.attributes?.includes('OAUTH_FLOW')) {
            const oneOfValue = (value as Record<string, unknown>)[oneOf.value];
            if (typeof oneOfValue === 'object' && oneOfValue !== null) {
              if ('_source_credential_id' in oneOfValue) {
                return true;
              }
              const requiredItems = Object.entries(oneOf.items).filter(([, item]) => item.required);
              if (requiredItems.length > 0) {
                return requiredItems.every(([itemName]) => {
                  const itemValue = (oneOfValue as Record<string, unknown>)[itemName];
                  return validateValue(itemValue, oneOf.items[itemName]);
                });
              }
            }
            return false;
          }

          return Object.entries(oneOf.items).every(([, item]) => {
            if (oneOf.value in value) {
              return validateOneOfRecursive((value as Record<string, unknown>)[oneOf.value], item);
            }
            return false;
          });
        });
      }

      return validateValue((value as Record<string, unknown>)[spec.name], spec);
    },
    [validateValue]
  );

  const validateConfiguration = useCallback(
    (config: Record<string, unknown>, specs: ConnectorSpecificationResponseApiDto[]) => {
      // On its old key a configuration is checked as before; otherwise a Credential fills the keys.
      const onOldKey = holdsOldKey(config, keyNames);
      const checked = onOldKey ? specs : specs.filter(spec => !keyNames.has(spec.name));
      const hasKey = onOldKey || keyNames.size === 0 || credentialIdOf(config) !== null;
      const requiredOneOfSpecs = checked.filter(spec => spec.required && spec.oneOf);

      const isValidOneOf =
        requiredOneOfSpecs.length === 0
          ? true
          : requiredOneOfSpecs.some(spec => validateOneOfRecursive(config[spec.name], spec));

      const requiredSpecs = checked.filter(spec => spec.required && spec.name !== 'Fields');
      const isValidRequired = requiredSpecs.every(spec => validateValue(config[spec.name], spec));

      const hasValidServiceAccount =
        !onOldKey ||
        connector.name !== GOOGLE_SHEETS_CONNECTOR_NAME ||
        hasValidGoogleSheetsServiceAccountConfiguration(config);

      return hasKey && isValidOneOf && isValidRequired && hasValidServiceAccount;
    },
    [connector.name, keyNames, validateValue, validateOneOfRecursive]
  );

  const handleSecretEditToggle = (name: string, enable: boolean) => {
    setSecretEditing(prev => ({ ...prev, [name]: enable }));
    if (!enable) {
      setConfiguration(prev => ({ ...prev, [name]: SECRET_MASK }));
    } else {
      setConfiguration(prev => ({ ...prev, [name]: '' }));
    }
  };

  // A version that keys a stored plain parameter must not keep sending it beside the Credential.
  useEffect(() => {
    if (!requirementKey) return;
    setConfiguration(prev =>
      credentialIdOf(prev) !== null && [...allKeyNames].some(name => name in prev)
        ? Object.fromEntries(Object.entries(prev).filter(([name]) => !allKeyNames.has(name)))
        : prev
    );
  }, [allKeyNames, requirementKey]);

  // The Credential replaces the old key and every key value; it decides the auth variant.
  const handleCredentialChange = (
    credentialId: string,
    variant: string | undefined,
    source: 'existing' | 'created' | 'auto',
    spreadsheetId?: string
  ) => {
    autoSelectedRef.current = source === 'auto';
    setConfiguration(prev => {
      const next: Record<string, unknown> = Object.fromEntries(
        Object.entries(prev).filter(([name]) => !allKeyNames.has(name) && name !== '_secrets_id')
      );
      if (variant && keyNames.has(AUTH_TYPE)) next[AUTH_TYPE] = { [variant]: {} };
      // A spreadsheet belongs to the account that picked it; another Credential picks its own.
      if (
        connector.name === GOOGLE_SHEETS_CONNECTOR_NAME &&
        credentialIdOf(prev) !== credentialId &&
        (spreadsheetId || prev.SpreadsheetId !== undefined)
      ) {
        next.SpreadsheetId = spreadsheetId ?? '';
      }
      next._credential_id = credentialId;
      return next;
    });
  };

  const handleCredentialClear = () => {
    setConfiguration(prev =>
      Object.fromEntries(Object.entries(prev).filter(([name]) => name !== '_credential_id'))
    );
  };

  useEffect(() => {
    if (connectorSpecification && onValidationChange) {
      const isValid = !keysUnknown && validateConfiguration(configuration, connectorSpecification);
      onValidationChange(isValid);
    }
  }, [
    configuration,
    connectorSpecification,
    keysUnknown,
    onValidationChange,
    validateConfiguration,
  ]);

  if (loading || requirementLoading) {
    return <AppWizardStepLoading variant='list' />;
  }

  if (keysUnknown) {
    return (
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepSection>
          <CredentialsLoadError
            onRetry={() => {
              setRequirement(null);
              setRequirementAttempt(attempt => attempt + 1);
            }}
          />
        </AppWizardStepSection>
      </AppWizardStep>
    );
  }

  if (!connectorSpecification || connectorSpecification.length === 0) {
    return (
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title='No configuration found'
          subtitle='This connector might not be fully implemented yet or there could be other issues.'
        />
        <OpenIssueLink label='Need configuration?' />
      </AppWizardStep>
    );
  }

  // Sort specifications by priority:
  // 1. Pinned fields and required fields without default value
  // 2. Required fields with default value
  // 3. Non-required fields without default value
  // 4. All others (non-required with default value)
  const sortedSpecifications = [...connectorSpecification]
    .filter(
      spec =>
        spec.name !== 'Fields' &&
        !spec.attributes?.includes(ConnectorSpecificationAttribute.HIDE_IN_CONFIG_FORM)
    )
    .sort((a, b) => {
      const getPriority = (spec: ConnectorSpecificationResponseApiDto) => {
        if (spec.attributes?.includes(ConnectorSpecificationAttribute.PINNED)) {
          return 1;
        }
        const hasDefault = spec.default != null && spec.default !== '';
        if (spec.required && !hasDefault) return 1;
        if (spec.required && hasDefault) return 2;
        if (!spec.required && !hasDefault) return 3;
        return 4;
      };

      return getPriority(a) - getPriority(b);
    });

  const selectedAuthType = isRecord(configuration.AuthType)
    ? Object.keys(configuration.AuthType)[0]
    : undefined;
  const credentialId = credentialIdOf(configuration);
  // On a Source Credential the Data Mart form lists the spreadsheets the Credential can open.
  const sheetsCredentialId =
    connector.name === GOOGLE_SHEETS_CONNECTOR_NAME && selectedAuthType === 'oauth2'
      ? credentialId
      : null;
  // Under an old-key OAuth the spreadsheet is chosen with Google Picker, so the manual
  // input stays hidden until the OAuth renderer explicitly reports manual mode
  // (settings still loading or not yet signed in must not flash the input).
  // The renderer only mounts on the OAuth tab, so an explicit "managed" report
  // is trusted even before the AuthType value itself is reflected in the state.
  const managedAuthTypeMode = managedOAuthModes.AuthType;
  const usesManagedGoogleSheetsOAuth =
    connector.name === GOOGLE_SHEETS_CONNECTOR_NAME &&
    (managedAuthTypeMode === true ||
      (selectedAuthType === 'oauth2' && managedAuthTypeMode !== false));
  const visibleSpecifications = sortedSpecifications
    .filter(
      spec =>
        !(usesManagedGoogleSheetsOAuth && !sheetsCredentialId && spec.name === 'SpreadsheetId')
    )
    // Service-account and old-key screens keep the plain input: no list exists for them.
    .map(spec =>
      connector.name === GOOGLE_SHEETS_CONNECTOR_NAME &&
      spec.name === 'SpreadsheetId' &&
      !sheetsCredentialId
        ? {
            ...spec,
            attributes: spec.attributes?.filter(
              attribute => attribute !== (ConnectorSpecificationAttribute.DYNAMIC_OPTIONS as string)
            ),
          }
        : spec
    );

  const requiredFields = visibleSpecifications.filter(
    spec => !spec.attributes?.includes('ADVANCED')
  );
  const advancedFields = visibleSpecifications.filter(spec =>
    spec.attributes?.includes('ADVANCED')
  );
  const managedOAuthModeChangeHandler =
    connector.name === GOOGLE_SHEETS_CONNECTOR_NAME ? handleManagedOAuthModeChange : undefined;

  const onOldKey = holdsOldKey(configuration, keyNames);
  const summary =
    dataMart?.sourceCredentials?.find(item => item.configId === configuration._id)?.summary ?? null;
  // A restricted Credential is not in the list.
  const restricted = summary?.access === 'restricted' && credentialId === seededCredentialId;
  const selection = customKeys?.selectionParameter
    ? configuration[customKeys.selectionParameter]
    : undefined;
  const keyFields = {
    names: keyNames,
    first: [...requiredFields, ...advancedFields].find(spec => keyNames.has(spec.name))?.name,
    showOldKey: onOldKey,
    field: seeded && (
      <ConnectorCredentialField
        connectorName={connector.name}
        variants={
          connectorSpecification.find(spec => spec.name === AUTH_TYPE)?.oneOf?.map(o => o.value) ??
          []
        }
        fitting={
          connector.isCustom
            ? {
                connectorName: connector.name,
                ...(pinnedVersion !== undefined ? { version: pinnedVersion } : {}),
                ...(typeof selection === 'string' ? { selection } : {}),
              }
            : undefined
        }
        // Without a selection parameter the answer does not depend on the selection.
        requirement={customKeys && !customKeys.selectionParameter ? customKeys : undefined}
        isNew={!configuration._id}
        value={restricted ? null : credentialId}
        summary={summary}
        onOldKey={onOldKey}
        keptCredentialId={seededCredentialId}
        onClear={handleCredentialClear}
        onChange={handleCredentialChange}
      />
    ),
  };

  return (
    <>
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <fieldset disabled={disabled} className='min-w-0'>
          <AppWizardStepSection>
            <div className='flex items-center justify-between'>
              <h3 className='text-muted-foreground/75 text-xs font-semibold tracking-wide uppercase'>
                Configure Settings
              </h3>
              <div className='flex items-center gap-2'>
                {onChangeVersion && (
                  <ConnectorVersionControl
                    info={connector}
                    version={pinnedVersion}
                    onChangeVersion={onChangeVersion}
                  />
                )}
              </div>
            </div>
            {requiredFields.length > 0 && (
              <ConfigurationListRender
                items={requiredFields}
                configuration={configuration}
                onValueChange={handleValueChange}
                onSecretEditToggle={handleSecretEditToggle}
                secretEditing={secretEditing}
                isEditingExisting={isEditingExisting}
                storedSecrets={storedSecrets}
                connectorName={connector.name}
                onManagedOAuthModeChange={managedOAuthModeChangeHandler}
                keyFields={keyFields}
              />
            )}
            {advancedFields.length > 0 && (
              <ConfigurationListRender
                collapsibleTitle='Advanced Settings'
                items={advancedFields}
                configuration={configuration}
                onValueChange={handleValueChange}
                onSecretEditToggle={handleSecretEditToggle}
                secretEditing={secretEditing}
                isEditingExisting={isEditingExisting}
                storedSecrets={storedSecrets}
                connectorName={connector.name}
                onManagedOAuthModeChange={managedOAuthModeChangeHandler}
                keyFields={keyFields}
              />
            )}
          </AppWizardStepSection>
        </fieldset>
      </AppWizardStep>
    </>
  );
}
