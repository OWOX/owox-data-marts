import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit';
import { ConnectorEditSheet } from './ConnectorEditSheet';

type Submit = (connector: ConnectorConfig, runAfterSave: boolean) => void;
const form = vi.hoisted(() => ({ onSubmit: null as Submit | null }));

vi.mock('../ConnectorEditForm/ConnectorEditForm', () => ({
  ConnectorEditForm: ({ onSubmit }: { onSubmit: Submit }) => {
    form.onSubmit = onSubmit;
    return null;
  },
}));
vi.mock('../../../../../shared/hooks/useIntercomLauncher', () => ({
  useIntercomLauncher: () => undefined,
}));

const connector: ConnectorConfig = {
  source: { name: 'BankOfCanada', configuration: [{}], node: 'rates', fields: ['date'] },
  storage: { fullyQualifiedName: 'dataset.rates' },
};

function Harness({ onSubmit }: { onSubmit: Submit }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <ConnectorEditSheet
      isOpen={isOpen}
      onClose={() => {
        setIsOpen(false);
      }}
      dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
      onSubmit={onSubmit}
    />
  );
}

describe('ConnectorEditSheet', () => {
  it('submits once when Save & Run is clicked again while the sheet closes', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    // Each click runs the handler of the latest render, as React does for a real button.
    act(() => {
      form.onSubmit?.(connector, true);
    });
    act(() => {
      form.onSubmit?.(connector, true);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(connector, true);
  });
});
