<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import TopBar from '../components/TopBar.vue';
import FilterPanel from '../components/FilterPanel.vue';
import CharacterTable from '../components/CharacterTable.vue';
import DetailPanel from '../components/DetailPanel.vue';
import CharacterModal from '../components/CharacterModal.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useDemoMode } from '../composables/useDemoMode';
import { onCharactersImported } from '../composables/useCharacters';
import type { Character } from '../types';

const selectedId = ref<string | null>(null);
const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const { demoCharacters } = useDemoMode();

const visibleIds = computed(() => demoCharacters.value.map(c => c.id));

const selectedCharacter = computed<Character | null>(() => {
  if (!selectedId.value) return null;
  return demoCharacters.value.find(c => c.id === selectedId.value) ?? null;
});

function handleSelect(char: Character | null) {
  selectedId.value = char?.id ?? null;
}

function handleEdit(char: Character) {
  editingCharacter.value = char;
  showModal.value = true;
}

function openCreate() {
  editingCharacter.value = null;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingCharacter.value = null;
}

function handleSaved(char: Character) {
  selectedId.value = char.id;
}

function handleDataImported() {
  if (selectedId.value) {
    const found = demoCharacters.value.find(c => c.id === selectedId.value);
    if (!found) {
      selectedId.value = null;
    }
  }
}

onMounted(() => {
  onCharactersImported(() => {
    handleDataImported();
  });
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" @open-create="openCreate" @data-imported="handleDataImported" />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <FilterPanel />

      <div class="grid grid-cols-1 xl:grid-cols-5 gap-4" style="height: calc(100vh - 200px); min-height: 520px;">
        <div class="xl:col-span-3">
          <CharacterTable
            :selected-id="selectedId"
            @select="handleSelect"
            @edit="handleEdit"
          />
        </div>
        <div class="xl:col-span-2">
          <DetailPanel
            :character="selectedCharacter"
            @close="selectedId = null"
            @edit="handleEdit"
          />
        </div>
      </div>
    </main>

    <CharacterModal
      :visible="showModal"
      :edit-character="editingCharacter"
      @close="closeModal"
      @saved="handleSaved"
    />

    <ToastContainer />
  </div>
</template>
