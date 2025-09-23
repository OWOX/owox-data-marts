import { useAppSelector } from '../core/store-hooks';
import type { FlagsState } from '../reducers/flags.reducer';

export function useFlags(): {
  flags: Record<string, unknown> | null;
  callState: FlagsState['callState'];
  error?: string;
} {
  const { data, callState, error } = useAppSelector(state => state.flags);
  return { flags: data, callState, error };
}
