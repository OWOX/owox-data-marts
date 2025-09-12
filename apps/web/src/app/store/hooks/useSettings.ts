import { useAppSelector } from '../core/store-hooks';
import type { SettingsState } from '../reducers/flags.reducer';

export function useSettings(): {
  settings: Record<string, unknown> | null;
  callState: SettingsState['callState'];
  error?: string;
} {
  const { data, callState, error } = useAppSelector(
    (state: { settings: SettingsState }) => state.settings
  );
  return { settings: data, callState, error };
}
