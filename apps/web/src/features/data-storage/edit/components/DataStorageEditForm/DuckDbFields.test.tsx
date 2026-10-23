import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from '@owox/ui/components/form';
import { DuckDbFields } from './DuckDbFields';

// FormItem/FormLabel from @owox/ui read react-hook-form context, so render the
// component inside a throwaway <Form> provider (same pattern as
// GoogleBigQueryFields.test.tsx). No submit is needed — just the provider.
function Wrapper({ databasePath }: { databasePath?: string }) {
  const form = useForm();
  return (
    <Form {...form}>
      <DuckDbFields databasePath={databasePath} />
    </Form>
  );
}

describe('DuckDbFields', () => {
  it('renders the read-only path and the connect-help accordion when databasePath is set', () => {
    render(<Wrapper databasePath='/data/owox-duckdb/storage-1.duckdb' />);
    expect(screen.getByText('Database file path')).toBeTruthy();
    expect(screen.getByText('/data/owox-duckdb/storage-1.duckdb')).toBeTruthy();
    expect(
      screen.getByText('The file is created on the first connector run or read.')
    ).toBeTruthy();
    expect(screen.getByText('How do I connect to this database?')).toBeTruthy();
  });

  it('renders no configuration content when databasePath is absent', () => {
    render(<Wrapper />);
    expect(screen.queryByText('Database file path')).toBeNull();
    expect(screen.queryByText('How do I connect to this database?')).toBeNull();
  });
});
