import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WantedRedirect } from './AppShell';

// The legacy /wanted URL no longer has its own page — it must set the Discover
// filter to "wanted" and redirect to Discover (/) so old links keep working.
describe('WantedRedirect — backward-compatible /wanted link', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("sets localStorage tt_discover_filter='wanted' and redirects to Discover (/)", async () => {
    render(
      <MemoryRouter initialEntries={['/wanted']}>
        <Routes>
          <Route path="/wanted" element={<WantedRedirect />} />
          <Route path="/" element={<div>Discover Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // The redirect happens inside a useEffect, so wait for Discover to render.
    await waitFor(() => {
      expect(screen.getByText('Discover Page')).toBeTruthy();
    });

    expect(localStorage.getItem('tt_discover_filter')).toBe('wanted');
  });
});
