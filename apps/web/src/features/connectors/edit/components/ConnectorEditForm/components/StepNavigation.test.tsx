import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StepNavigation } from './StepNavigation';

function renderLastStep(props: Partial<Parameters<typeof StepNavigation>[0]> = {}) {
  const onFinish = vi.fn();
  render(
    <StepNavigation
      currentStep={2}
      totalSteps={2}
      canGoNext
      canGoBack
      onNext={vi.fn()}
      onBack={vi.fn()}
      onFinish={onFinish}
      {...props}
    />
  );
  return onFinish;
}

describe('StepNavigation — final action', () => {
  it('offers only Save when a run is not possible', () => {
    const onFinish = renderLastStep();

    expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onFinish).toHaveBeenCalledWith(false);
  });

  it('makes Save the main action and puts Save & Run in the menu by default', async () => {
    const onFinish = renderLastStep({ canRunAfterSave: true });

    expect(screen.queryByRole('button', { name: 'Save & Run' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onFinish).toHaveBeenLastCalledWith(false);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await within(document.body).findByRole('menuitem', { name: 'Save & Run' }));
    expect(onFinish).toHaveBeenLastCalledWith(true);
  });

  it('makes Save & Run the main action when asked', () => {
    const onFinish = renderLastStep({ canRunAfterSave: true, runIsMainAction: true });

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it('keeps a plain Save in the menu of Save & Run', async () => {
    const onFinish = renderLastStep({ canRunAfterSave: true, runIsMainAction: true });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await within(document.body).findByRole('menuitem', { name: 'Save' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(false);
  });

  it('shows the same split action in the one-step layout', () => {
    const onFinish = renderLastStep({
      canRunAfterSave: true,
      runIsMainAction: true,
      currentStep: 1,
      totalSteps: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save & Run' }));

    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it('disables both halves until the step is complete', () => {
    renderLastStep({ canRunAfterSave: true, runIsMainAction: true, canGoNext: false });

    expect(screen.getByRole('button', { name: 'Save & Run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeDisabled();
  });
});
