'use client';

import { useState } from 'react';

/**
 * Bulk-selection state for the Vinted list. Toggleable mode + per-row checked
 * IDs + clear helpers. Returns stable handlers — exiting selection mode
 * always clears the selection.
 */
export function useSelectionMode() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectionMode() {
    setSelectionMode((m) => {
      if (m) {
        // Exiting selection mode → clear selection
        setSelectedIds(new Set());
      }
      return !m;
    });
  }

  function cancelSelection() {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  return {
    selectionMode,
    selectedIds,
    toggleSelect,
    toggleSelectionMode,
    cancelSelection,
  };
}
