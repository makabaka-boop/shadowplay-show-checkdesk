import { ref, computed } from 'vue';
import type { Character, FilterOptions, CharacterStatus, RiskLevel } from '../types';
import { useCharacters } from './useCharacters';

const defaultFilters: FilterOptions = {
  story: '',
  owner: '',
  status: [],
  riskLevel: [],
  orderMin: null,
  orderMax: null,
};

const filters = ref<FilterOptions>({ ...defaultFilters });

export function useFilters() {
  const { characters } = useCharacters();

  const filteredCharacters = computed<Character[]>(() => {
    return characters.value.filter(char => {
      if (filters.value.story && char.story !== filters.value.story) return false;
      if (filters.value.owner && char.owner !== filters.value.owner) return false;
      if (filters.value.status.length > 0 && !filters.value.status.includes(char.status)) return false;
      if (filters.value.riskLevel.length > 0 && !filters.value.riskLevel.includes(char.riskLevel)) return false;
      if (filters.value.orderMin !== null && char.demoOrder < filters.value.orderMin) return false;
      if (filters.value.orderMax !== null && char.demoOrder > filters.value.orderMax) return false;
      return true;
    }).sort((a, b) => a.demoOrder - b.demoOrder);
  });

  function setFilter<K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) {
    filters.value[key] = value;
  }

  function toggleStatusFilter(status: CharacterStatus) {
    const idx = filters.value.status.indexOf(status);
    if (idx === -1) {
      filters.value.status.push(status);
    } else {
      filters.value.status.splice(idx, 1);
    }
  }

  function toggleRiskFilter(risk: RiskLevel) {
    const idx = filters.value.riskLevel.indexOf(risk);
    if (idx === -1) {
      filters.value.riskLevel.push(risk);
    } else {
      filters.value.riskLevel.splice(idx, 1);
    }
  }

  function resetFilters() {
    filters.value = { ...defaultFilters, status: [], riskLevel: [] };
  }

  const hasActiveFilters = computed(() => {
    return (
      filters.value.story !== '' ||
      filters.value.owner !== '' ||
      filters.value.status.length > 0 ||
      filters.value.riskLevel.length > 0 ||
      filters.value.orderMin !== null ||
      filters.value.orderMax !== null
    );
  });

  return {
    filters,
    filteredCharacters,
    setFilter,
    toggleStatusFilter,
    toggleRiskFilter,
    resetFilters,
    hasActiveFilters,
  };
}
