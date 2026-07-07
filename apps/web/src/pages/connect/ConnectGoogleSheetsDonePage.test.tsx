import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ConnectGoogleSheetsDonePage } from './ConnectGoogleSheetsDonePage';

function renderDonePage() {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/connect/google-sheets/done']}>
      <Routes>
        <Route
          path='/ui/:projectId/connect/google-sheets/done'
          element={<ConnectGoogleSheetsDonePage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConnectGoogleSheetsDonePage', () => {
  it('shows a generic success message, with no data taken from the URL', () => {
    renderDonePage();

    expect(
      screen.getByText(/your google sheets destination was created successfully/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/you can close this tab now/i)).toBeInTheDocument();
  });
});
