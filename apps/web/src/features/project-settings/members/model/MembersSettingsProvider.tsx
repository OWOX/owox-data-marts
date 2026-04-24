import type { ReactNode } from 'react';
import {
  MembersSettingsReactContext,
  type MembersSettingsStoreValue,
} from './members-settings.context';

export function MembersSettingsProvider({
  value,
  children,
}: {
  value: MembersSettingsStoreValue;
  children: ReactNode;
}) {
  return (
    <MembersSettingsReactContext.Provider value={value}>
      {children}
    </MembersSettingsReactContext.Provider>
  );
}
