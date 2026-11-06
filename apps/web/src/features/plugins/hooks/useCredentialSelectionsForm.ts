import { useCallback, useEffect, useMemo, useState } from 'react';
import { isCredentialEligible, useCredentials, type Credential } from '../../credentials';
import type { NormalizedPluginCredentialRequirement } from '../../credentials/types';

export type CredentialSelectionsForm = ReturnType<typeof useCredentialSelectionsForm>;

/**
 * The member's Credential choice for each requirement a plugin declares, as the install
 * dialog and the Credentials tab both edit it.
 *
 * Starts from `initialSelections` and starts over whenever they or `resetKey` change, so
 * pass a memoized object: a fresh literal each render would wipe every choice.
 */
export function useCredentialSelectionsForm(
  requirements: readonly NormalizedPluginCredentialRequirement[],
  initialSelections: Readonly<Record<string, string | null>>,
  resetKey: unknown
) {
  const {
    credentials,
    isLoading: credentialsLoading,
    isError: credentialsFailed,
  } = useCredentials();
  const [selections, setSelections] =
    useState<Partial<Record<string, string | null>>>(initialSelections);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [inlineCredentials, setInlineCredentials] = useState<Credential[]>([]);

  const reset = useCallback(() => {
    setSelections(initialSelections);
    setTouched(new Set());
  }, [initialSelections]);
  useEffect(() => {
    reset();
    setInlineCredentials([]);
  }, [reset, resetKey]);

  const availableCredentials = useMemo(
    () => [
      ...credentials,
      ...inlineCredentials.filter(
        inline => !credentials.some(credential => credential.id === inline.id)
      ),
    ],
    [credentials, inlineCredentials]
  );
  const eligibleByKey = useMemo(
    () =>
      new Map(
        requirements.map(requirement => [
          requirement.key,
          availableCredentials.filter(credential => isCredentialEligible(credential, requirement)),
        ])
      ),
    [requirements, availableCredentials]
  );

  // A granted Credential since disabled or deleted is no decision: the member has to pick again.
  const isDecided = (key: string) => {
    const selected = own(selections, key);
    if (selected === undefined) return false;
    return selected === null || (eligibleByKey.get(key) ?? []).some(item => item.id === selected);
  };

  const touch = useCallback((key: string) => {
    setTouched(current => new Set(current).add(key));
  }, []);
  const select = useCallback((key: string, credentialId: string | null) => {
    setSelections(current => ({ ...current, [key]: credentialId }));
  }, []);
  const addCredential = useCallback(
    (key: string, created: Credential) => {
      setInlineCredentials(current => [...current, created]);
      select(key, created.id);
      touch(key);
    },
    [select, touch]
  );

  // A plugin that declares no Credentials does not wait for the list or stop when it fails.
  const needsCredentials = requirements.length > 0;

  return {
    requirements,
    selections,
    touched,
    credentialsLoading: needsCredentials && credentialsLoading,
    credentialsFailed: needsCredentials && credentialsFailed,
    availableCredentials,
    eligibleByKey,
    isDecided,
    missingDecision: requirements.some(requirement => !isDecided(requirement.key)),
    isDirty: requirements.some(
      requirement => own(selections, requirement.key) !== own(initialSelections, requirement.key)
    ),
    // Declared keys only: the server refuses a selection for a requirement it does not know.
    submission: Object.fromEntries(
      requirements.flatMap(requirement => {
        const selected = own(selections, requirement.key);
        return selected === undefined ? [] : [[requirement.key, selected]];
      })
    ) as Record<string, string | null>,
    select,
    touch,
    addCredential,
    reset,
  };
}

/** Own keys only: requirement keys come from the publisher and may name an Object member. */
function own<T>(record: Readonly<Partial<Record<string, T>>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
