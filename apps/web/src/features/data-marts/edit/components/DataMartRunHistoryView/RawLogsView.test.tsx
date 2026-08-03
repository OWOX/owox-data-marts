// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RawLogsView } from './RawLogsView';

// Warnings and genuine failures share the run's errors array, so the raw view has to
// partition them — otherwise switching from Structured to Raw shows every classified
// warning as an error again.
const WARNING =
  '{"type":"addWarningToCurrentStatus","at":"2026-07-27 14:16:21","warning":"Session has expired"}';
const FAILURE = '{"type":"error","at":"2026-07-27 14:16:21","error":"Unexpected end of script"}';

describe('RawLogsView', () => {
  it('shows warnings under their own heading, not under Error Output', () => {
    render(<RawLogsView logs={[]} errors={[WARNING]} />);

    expect(screen.getByText('Warnings:')).toBeInTheDocument();
    expect(screen.queryByText('Error Output:')).not.toBeInTheDocument();
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it('keeps genuine failures under Error Output', () => {
    render(<RawLogsView logs={[]} errors={[FAILURE]} />);

    expect(screen.getByText('Error Output:')).toBeInTheDocument();
    expect(screen.queryByText('Warnings:')).not.toBeInTheDocument();
  });

  it('splits a mixed errors array across both sections', () => {
    render(<RawLogsView logs={[]} errors={[WARNING, FAILURE]} />);

    expect(screen.getByText('Error Output:')).toBeInTheDocument();
    expect(screen.getByText('Warnings:')).toBeInTheDocument();
  });

  it('treats unparseable raw text as a failure', () => {
    render(<RawLogsView logs={[]} errors={['TypeError: something exploded']} />);

    expect(screen.getByText('Error Output:')).toBeInTheDocument();
    expect(screen.queryByText('Warnings:')).not.toBeInTheDocument();
  });
});
