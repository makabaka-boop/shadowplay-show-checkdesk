import { ref, computed } from 'vue';
import { useFilters } from './useFilters';
import { useAutoCheck } from './useAutoCheck';
import type { Character } from '../types';

const isDemoMode = ref(false);

export function useDemoMode() {
  const { filteredCharacters } = useFilters();
  const { hasMissingAccessories, isHighRisk } = useAutoCheck();

  function toggleDemoMode() {
    isDemoMode.value = !isDemoMode.value;
  }

  const demoCharacters = computed<Character[]>(() => {
    if (!isDemoMode.value) return filteredCharacters.value;
    return filteredCharacters.value.filter(
      c => hasMissingAccessories(c) || isHighRisk(c)
    );
  });

  return {
    isDemoMode,
    toggleDemoMode,
    demoCharacters,
  };
}
