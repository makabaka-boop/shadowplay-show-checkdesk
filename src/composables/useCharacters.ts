import { ref, computed, watch } from 'vue';
import type { Character } from '../types';
import { normalizeCharacter } from '../types';
import { mockCharacters } from '../data/mockData';

const STORAGE_KEY = 'shadow-puppetry-characters';

type Listener = () => void;
const importListeners: Listener[] = [];

export function onCharactersImported(listener: Listener) {
  importListeners.push(listener);
  return () => {
    const idx = importListeners.indexOf(listener);
    if (idx !== -1) importListeners.splice(idx, 1);
  };
}

function notifyImportListeners() {
  importListeners.forEach(fn => {
    try { fn(); } catch { /* noop */ }
  });
}

function loadFromStorage(): Character[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(item => normalizeCharacter(item));
      }
    }
  } catch {
    console.warn('Failed to load characters from storage');
  }
  return mockCharacters;
}

function saveToStorage(chars: Character[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
  } catch {
    console.warn('Failed to save characters to storage');
  }
}

const characters = ref<Character[]>(loadFromStorage());

watch(characters, (newVal) => {
  saveToStorage(newVal);
}, { deep: true });

export function useCharacters() {
  function generateId(): string {
    return 'char_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addCharacter(data: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString();
    const newChar: Character = normalizeCharacter({
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    });
    characters.value.push(newChar);
    return newChar;
  }

  function updateCharacter(id: string, updates: Partial<Character>) {
    const index = characters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      characters.value[index] = normalizeCharacter({
        ...characters.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      return characters.value[index];
    }
    return null;
  }

  function deleteCharacter(id: string) {
    const index = characters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      characters.value.splice(index, 1);
      return true;
    }
    return false;
  }

  function copyCharacter(id: string): Character | null {
    const original = characters.value.find(c => c.id === id);
    if (!original) return null;
    const now = new Date().toISOString();
    const copy: Character = normalizeCharacter({
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      name: (original.name || '未命名') + ' (副本)',
      createdAt: now,
      updatedAt: now,
    });
    characters.value.push(copy);
    return copy;
  }

  function getCharacterById(id: string): Character | undefined {
    return characters.value.find(c => c.id === id);
  }

  const allStories = computed(() => {
    const set = new Set(characters.value.map(c => c.story).filter(Boolean));
    return Array.from(set).sort();
  });

  const allOwners = computed(() => {
    const set = new Set(characters.value.map(c => c.owner).filter(Boolean));
    return Array.from(set).sort();
  });

  function exportData(): string {
    return JSON.stringify(characters.value, null, 2);
  }

  function importData(jsonStr: string): { success: boolean; count: number; invalidCount: number } {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, invalidCount: 0 };
      }
      const normalized: Character[] = [];
      let invalidCount = 0;
      parsed.forEach((item) => {
        if (!item || typeof item !== 'object') {
          invalidCount++;
          return;
        }
        try {
          normalized.push(normalizeCharacter(item));
        } catch {
          invalidCount++;
        }
      });
      characters.value = normalized;
      notifyImportListeners();
      return { success: true, count: normalized.length, invalidCount };
    } catch {
      return { success: false, count: 0, invalidCount: 0 };
    }
  }

  return {
    characters,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    copyCharacter,
    getCharacterById,
    allStories,
    allOwners,
    exportData,
    importData,
  };
}
