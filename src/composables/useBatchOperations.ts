import { ref, computed } from 'vue';
import type { CharacterStatus } from '../types';
import { useCharacters } from './useCharacters';

const selectedIds = ref<Set<string>>(new Set());

export function useBatchOperations() {
  const { updateCharacter } = useCharacters();

  function toggleSelect(id: string) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id);
    } else {
      selectedIds.value.add(id);
    }
    selectedIds.value = new Set(selectedIds.value);
  }

  function selectAll(ids: string[]) {
    selectedIds.value = new Set(ids);
  }

  function clearSelection() {
    selectedIds.value = new Set();
  }

  function isSelected(id: string): boolean {
    return selectedIds.value.has(id);
  }

  const selectedCount = computed(() => selectedIds.value.size);

  const hasSelection = computed(() => selectedIds.value.size > 0);

  function batchUpdateStatus(status: CharacterStatus, visibleIds?: string[]): number {
    let count = 0;
    selectedIds.value.forEach(id => {
      if (visibleIds && !visibleIds.includes(id)) {
        return;
      }
      if (updateCharacter(id, { status })) {
        count++;
      }
    });
    return count;
  }

  return {
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount,
    hasSelection,
    batchUpdateStatus,
  };
}
