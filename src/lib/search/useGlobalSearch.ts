// Shared hook so every search box in the app routes through the one unified
// Search Results page. Call the returned function on submit (Enter key or the
// search icon) with the typed term.

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export function useGlobalSearch() {
  const navigate = useNavigate();
  return useCallback(
    (term: string) => {
      const q = term.trim();
      if (!q) return;
      navigate(`/search?q=${encodeURIComponent(q)}`);
    },
    [navigate],
  );
}
