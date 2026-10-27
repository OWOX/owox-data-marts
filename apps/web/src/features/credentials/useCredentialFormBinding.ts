import { useCallback, useRef, useState } from 'react';
import {
  useForm,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormProps,
} from 'react-hook-form';
import type { CredentialSummary } from './types';

export type CredentialChoice = 'existing' | 'created' | 'auto';

/**
 * The form of a Storage or Destination, with the Credential binding it had when it opened.
 * `formProps` builds the form from that binding: whether there is one and the id to start with.
 */
export function useCredentialFormBinding<T extends FieldValues, S extends CredentialSummary>(
  reusableCredential: S | null | undefined,
  formProps: (binding: {
    hasBinding: boolean;
    initialCredentialId: string | null;
  }) => UseFormProps<T>
) {
  // Fixed at mount, like the form's default values it is compared with.
  const [initialCredential] = useState(() => reusableCredential ?? null);
  const initialCredentialId = initialCredential?.access === 'visible' ? initialCredential.id : null;
  // A consumer still on its own key counts as bound: it keeps that key until the member picks one.
  const hasBinding = initialCredential !== null;
  // Built once: the binding is fixed at mount, and the form reads its defaults only then.
  const [formOptions] = useState(() => formProps({ hasBinding, initialCredentialId }));
  const form = useForm<T>(formOptions);
  const credentialSourceRef = useRef<CredentialChoice>('existing');
  const handleCredentialChange = useCallback(
    (id: string, source: CredentialChoice) => {
      credentialSourceRef.current = source;
      // A preselected Credential alone does not make the form dirty.
      form.setValue('reusableCredentialId' as Path<T>, id as PathValue<T, Path<T>>, {
        shouldDirty: source !== 'auto',
        shouldValidate: true,
      });
    },
    [form]
  );

  return {
    form,
    initialCredential,
    initialCredentialId,
    hasBinding,
    credentialSourceRef,
    handleCredentialChange,
  };
}
