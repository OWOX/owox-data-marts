import { useCallback, useEffect, useMemo, useState } from 'react';
import { isCredentialEligible, useCredentials, type Credential } from '../../credentials';
import type { NormalizedPluginCredentialRequirement } from '../../credentials/types';
import { OWOX_AI_SELECTION, offersOwoxAi } from '../credentialRequirements';
import { useOwoxAi } from './useOwoxAi';

export type CredentialSelectionsForm = ReturnType<typeof useCredentialSelectionsForm>;

/**
 * The member's Credential choice for each requirement a plugin declares, as the install
 * dialog and the Credentials tab both edit it.
 *
 * Starts from `initialSelections` and starts over whenever they or `resetKey` change, so
 * pass a memoized object: a fresh literal each render would wipe every choice.
 * `preselectOwoxAi` gives OWOX AI to each requirement it serves that has no choice yet.
 */
export function useCredentialSelectionsForm(
  requirements: readonly NormalizedPluginCredentialRequirement[],
  initialSelections: Readonly<Record<string, string | null>>,
  resetKey: unknown,
  { preselectOwoxAi = false }: { preselectOwoxAi?: boolean } = {}
) {
  const {
    credentials,
    isLoading: credentialsLoading,
    isError: credentialsFailed,
  } = useCredentials();
  const { owoxAi, isLoading: owoxAiStatusLoading, isError: owoxAiStatusFailed } = useOwoxAi();
  const [chosen, setSelections] =
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

  const offers = useCallback(
    (requirement: NormalizedPluginCredentialRequirement) =>
      offersOwoxAi(owoxAi, requirement) ||
      // A status that cannot be read keeps a saved OWOX AI choice; the server checks it on save.
      (owoxAiStatusFailed &&
        requirement.definitionId === null &&
        own(chosen, requirement.key) === OWOX_AI_SELECTION),
    [owoxAi, owoxAiStatusFailed, chosen]
  );
  // An OWOX AI choice the status no longer offers (it was refetched) is no choice. Derived,
  // not stored: a status that arrives late must not replace a choice the member made.
  const selections = useMemo(
    () =>
      Object.fromEntries(
        requirements.flatMap((requirement): [string, string | null][] => {
          const selected = own(chosen, requirement.key);
          if (selected === undefined) {
            return preselectOwoxAi && offers(requirement)
              ? [[requirement.key, OWOX_AI_SELECTION]]
              : [];
          }
          if (selected === OWOX_AI_SELECTION && !offers(requirement)) return [];
          return [[requirement.key, selected]];
        })
      ) as Record<string, string | null>,
    [requirements, chosen, preselectOwoxAi, offers]
  );

  // A granted Credential since disabled or deleted is no decision: the member has to pick again.
  const isDecided = (key: string) => {
    const selected = own(selections, key);
    if (selected === undefined) return false;
    return (
      selected === null ||
      selected === OWOX_AI_SELECTION ||
      (eligibleByKey.get(key) ?? []).some(item => item.id === selected)
    );
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
  // Only a logical requirement can use OWOX AI, so only it waits for the status.
  const needsOwoxAi = requirements.some(requirement => requirement.definitionId === null);

  return {
    requirements,
    selections,
    touched,
    credentialsLoading: needsCredentials && credentialsLoading,
    credentialsFailed: needsCredentials && credentialsFailed,
    owoxAi,
    owoxAiLoading: needsOwoxAi && owoxAiStatusLoading,
    offersOwoxAi: offers,
    // An OWOX AI choice that the loaded status no longer offers, so the member must choose again.
    owoxAiChoiceUnusable: (requirement: NormalizedPluginCredentialRequirement) =>
      own(chosen, requirement.key) === OWOX_AI_SELECTION &&
      !owoxAiStatusLoading &&
      !offers(requirement),
    availableCredentials,
    eligibleByKey,
    isDecided,
    missingDecision: requirements.some(requirement => !isDecided(requirement.key)),
    isDirty: requirements.some(
      requirement => own(chosen, requirement.key) !== own(initialSelections, requirement.key)
    ),
    // Declared keys only: the server refuses a selection for a requirement it does not know.
    submission: selections,
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
