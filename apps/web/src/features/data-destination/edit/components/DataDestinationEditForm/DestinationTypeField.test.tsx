// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '@owox/ui/components/form';
import {
  type DataDestinationFormData,
  DataDestinationType,
  DataDestinationTypeModel,
} from '../../../shared';
import { DestinationTypeField } from './DestinationTypeField';

vi.mock('../../../../../app/store/hooks', () => ({
  useFlags: () => ({ flags: { LICENSED_APP_EDITION: 'COMMUNITY' } }),
}));

function TestForm() {
  const form = useForm<DataDestinationFormData>({
    defaultValues: {
      title: 'New Destination',
      type: DataDestinationType.GOOGLE_SHEETS,
    },
  });

  return (
    <Form {...form}>
      <DestinationTypeField form={form} />
    </Form>
  );
}

function openTypeList() {
  fireEvent.pointerDown(screen.getByRole('combobox'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
}

describe('DestinationTypeField', () => {
  it('enables every configurable destination type in Community and keeps only OData disabled', async () => {
    render(<TestForm />);

    openTypeList();

    for (const name of [
      'Google Sheets',
      'Microsoft Excel',
      'Data Studio',
      'Email',
      'Slack',
      'Microsoft Teams',
      'Google Chat',
    ]) {
      const option = await within(document.body).findByRole('option', { name: new RegExp(name) });
      expect(option).not.toHaveAttribute('aria-disabled', 'true');
    }

    expect(await within(document.body).findByRole('option', { name: /OData/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('lists Microsoft Excel right after Google Sheets', () => {
    expect(DataDestinationTypeModel.getAllTypes().map(({ displayName }) => displayName)).toEqual([
      'Google Sheets',
      'Microsoft Excel',
      'Data Studio',
      'Email',
      'Slack',
      'Microsoft Teams',
      'Google Chat',
      'OData',
    ]);
  });
});
