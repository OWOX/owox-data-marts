// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '@owox/ui/components/form';
import { type DataDestinationFormData, DataDestinationType } from '../../../shared';
import { DestinationTypeField } from './DestinationTypeField';

vi.mock('../../../../../app/store/hooks', () => ({
  useFlags: () => ({ flags: { LICENSED_APP_EDITION: 'COMMUNITY' } }),
}));

// Two components rather than one with a `type` prop: the form data is a discriminated union,
// so only a literal narrows its default values to a single member.
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

function ExcelTestForm() {
  const form = useForm<DataDestinationFormData>({
    defaultValues: {
      title: 'Microsoft Excel',
      type: DataDestinationType.EXCEL,
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

    fireEvent.pointerDown(screen.getByRole('combobox'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });

    for (const name of [
      'Google Sheets',
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

  it('does not offer Excel, which the add-in sets up on its own', async () => {
    render(<TestForm />);

    openTypeList();

    await within(document.body).findByRole('option', { name: /Google Sheets/ });
    expect(
      within(document.body).queryByRole('option', { name: /Microsoft Excel/ })
    ).not.toBeInTheDocument();
  });

  it('still names Excel while editing an Excel destination', async () => {
    // Filtering it out unconditionally would leave the type field of an existing Excel
    // destination blank.
    render(<ExcelTestForm />);

    openTypeList();

    expect(
      await within(document.body).findByRole('option', { name: /Microsoft Excel/ })
    ).toBeInTheDocument();
  });
});
