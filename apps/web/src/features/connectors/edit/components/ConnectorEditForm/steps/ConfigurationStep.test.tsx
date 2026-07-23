import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigurationStep } from './ConfigurationStep';
import type { ConnectorSpecificationResponseApiDto } from '../../../../shared/api';
import { RequiredType } from '../../../../shared/api';

vi.mock(
  '../../../../../data-marts/edit/components/DataMartDefinitionSettings/form/CopyConfigurationButton',
  () => ({ CopyConfigurationButton: () => null })
);

vi.mock('../../../../../../utils', () => ({ trackEvent: vi.fn() }));

const connector = {
  name: 'GoogleAds',
  displayName: 'Google Ads',
  description: '',
  logoBase64: null,
  docUrl: null,
};

const spec: ConnectorSpecificationResponseApiDto[] = [
  {
    name: 'CustomerId',
    title: 'Customer ID',
    requiredType: RequiredType.STRING,
    required: true,
  },
  {
    name: 'AuthType',
    title: 'Auth Type',
    requiredType: RequiredType.OBJECT,
    required: true,
    oneOf: [
      {
        label: 'Service Account',
        value: 'service_account',
        requiredType: RequiredType.OBJECT,
        items: {
          ServiceAccountKey: {
            name: 'ServiceAccountKey',
            title: 'Service Account Key',
            requiredType: RequiredType.STRING,
            required: true,
            attributes: ['SECRET'],
          },
        },
      },
    ],
  },
];

/**
 * Mimics ConnectorEditForm: stores the reported configuration by reference and
 * hands that same object straight back as `initialConfiguration`.
 */
function Harness() {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  return (
    <ConfigurationStep
      connector={connector}
      connectorSpecification={spec}
      initialConfiguration={configuration}
      onConfigurationChange={setConfiguration}
    />
  );
}

/** Types one character the way a browser does: append to the current DOM value. */
function typeChar(input: HTMLInputElement, char: string) {
  fireEvent.change(input, { target: { value: input.value + char } });
}

describe('ConfigurationStep', () => {
  // The two typing tests below are smoke coverage for controlled-input wiring, not
  // regression cover for the parent/child echo race. Verified by reverting the echo
  // guard in ConfigurationStep: they still pass. `fireEvent` wraps every event in
  // `act()`, which flushes effects to completion between keystrokes, so the prop can
  // never be staler than local state and the race cannot occur here. The echo contract
  // is pinned by reference in ConnectorEditForm.test.tsx instead.
  it('keeps every typed character in a top-level field', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Customer ID/i);

    for (const char of 'ABCDEFGH') {
      typeChar(input, char);
    }

    expect(input.value).toBe('ABCDEFGH');
  });

  it('keeps every typed character in a nested oneOf secret field', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Service Account Key/i);

    for (const char of 'ABCDEFGH') {
      typeChar(input, char);
    }

    expect(input.value).toBe('ABCDEFGH');
  });

  // Real regression cover: verified to fail when `isSecret` is made value-derived again.
  // `isSecret` must come from the spec alone. Deriving it from the value flipped it on
  // the first keystroke, which swapped ConfigurationStringField for
  // ConfigurationSecretField, remounted the input and dropped focus.
  it('renders a nested secret field as the same element across the first keystroke', () => {
    render(<Harness />);
    const before = screen.getByLabelText(/Service Account Key/i);
    before.focus();
    expect(document.activeElement).toBe(before);

    typeChar(before, 'A');

    const after = screen.getByLabelText(/Service Account Key/i);
    expect(after).toBe(before);
    expect(document.activeElement).toBe(before);
  });
});
