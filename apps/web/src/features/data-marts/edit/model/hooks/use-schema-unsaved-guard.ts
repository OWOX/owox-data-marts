import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';

export type SchemaGuardIntent = 'ai' | 'refresh' | 'publish' | 'definition' | 'navigation';

export type ResolvedSchema = DataMartSchema | null | undefined;

export interface SchemaGuardRegistration {
  isDirty: () => boolean;
  getSchema: () => ResolvedSchema;
  save: () => Promise<ResolvedSchema>;
  discard: () => ResolvedSchema;
}

export type GuardedAction = (resolvedSchema: ResolvedSchema) => void | Promise<void>;

export interface SchemaUnsavedGuard {
  isSchemaDirty: boolean;
  registerSchemaGuard: (registration: SchemaGuardRegistration | null) => void;
  runGuarded: (action: GuardedAction, opts: { intent: SchemaGuardIntent }) => void;
  dialog: {
    open: boolean;
    intent: SchemaGuardIntent;
    isSaving: boolean;
    onSaveAndContinue: () => void;
    onDiscardAndContinue: () => void;
    onCancel: () => void;
  };
}

export function useSchemaUnsavedGuard(): SchemaUnsavedGuard {
  const registrationRef = useRef<SchemaGuardRegistration | null>(null);
  const isSchemaDirtyRef = useRef(false);
  const pendingActionRef = useRef<GuardedAction | null>(null);
  const [isSchemaDirty, setIsSchemaDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<SchemaGuardIntent>('refresh');
  const [isSaving, setIsSaving] = useState(false);

  const registerSchemaGuard = useCallback((registration: SchemaGuardRegistration | null) => {
    registrationRef.current = registration;
    const nextIsDirty = registration?.isDirty() ?? false;
    isSchemaDirtyRef.current = nextIsDirty;
    setIsSchemaDirty(nextIsDirty);
  }, []);

  const runAction = useCallback(async (resolved: ResolvedSchema) => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) await action(resolved);
  }, []);

  // Block in-app navigation while the schema has unsaved edits.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (registrationRef.current?.isDirty() ?? false) &&
      currentLocation.pathname !== nextLocation.pathname
  );

  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  useEffect(() => {
    if (blocker.state === 'blocked') {
      pendingActionRef.current = () => {
        blockerRef.current.proceed?.();
      };
      setIntent('navigation');
      setOpen(true);
    }
  }, [blocker]);

  // Native prompt for hard tab/window close or reload.
  useEffect(() => {
    if (!isSchemaDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Safari / older Chromium still require returnValue to be set to show the prompt.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isSchemaDirty]);

  const runGuarded = useCallback(
    (action: GuardedAction, opts: { intent: SchemaGuardIntent }) => {
      const registration = registrationRef.current;
      pendingActionRef.current = action;
      if (!registration?.isDirty()) {
        void runAction(registration?.getSchema());
        return;
      }
      setIntent(opts.intent);
      setOpen(true);
    },
    [runAction]
  );

  const onSaveAndContinue = useCallback(() => {
    const registration = registrationRef.current;
    if (!registration) {
      setOpen(false);
      return;
    }
    void (async () => {
      setIsSaving(true);
      let resolved: ResolvedSchema;
      try {
        resolved = await registration.save();
      } catch {
        setIsSaving(false);
        // Keep the dialog open; the user keeps their unsaved changes.
        return;
      }
      // Mark the registration as clean immediately so any navigation inside
      // the pending action is not blocked by the stale dirty flag.
      registrationRef.current = { ...registration, isDirty: () => false };
      isSchemaDirtyRef.current = false;
      setIsSchemaDirty(false);
      setIsSaving(false);
      setOpen(false);
      await runAction(resolved);
    })();
  }, [runAction]);

  const onDiscardAndContinue = useCallback(() => {
    const registration = registrationRef.current;
    const resolved = registration ? registration.discard() : undefined;
    // Mark the registration as clean immediately so any navigation inside
    // the pending action is not blocked by the stale dirty flag.
    if (registration) {
      registrationRef.current = { ...registration, isDirty: () => false };
    }
    isSchemaDirtyRef.current = false;
    setIsSchemaDirty(false);
    setOpen(false);
    void runAction(resolved);
  }, [runAction]);

  const onCancel = useCallback(() => {
    pendingActionRef.current = null;
    if (blockerRef.current.state === 'blocked') {
      blockerRef.current.reset();
    }
    setOpen(false);
  }, []);

  return {
    isSchemaDirty,
    registerSchemaGuard,
    runGuarded,
    dialog: { open, intent, isSaving, onSaveAndContinue, onDiscardAndContinue, onCancel },
  };
}
