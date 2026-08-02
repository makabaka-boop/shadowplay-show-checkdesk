<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ListTodo, ArrowRight, AlertTriangle } from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import FilterPanel from '../components/FilterPanel.vue';
import CharacterTable from '../components/CharacterTable.vue';
import DetailPanel from '../components/DetailPanel.vue';
import CharacterModal from '../components/CharacterModal.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useDemoMode } from '../composables/useDemoMode';
import { onCharactersImported } from '../composables/useCharacters';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import type { Character } from '../types';

const router = useRouter();
const { tasks } = useInspectionTasks();

const openTaskCount = computed(
  () => tasks.value.filter(t => t.status === 'open' || t.status === 'in_progress').length
);
const blockedTaskCount = computed(
  () => tasks.value.filter(t => t.status === 'blocked').length
);
const criticalTaskCount = computed(
  () => tasks.value.filter(t => (t.severity === 'critical' || t.severity === 'high') && t.status !== 'resolved' && t.status !== 'dismissed').length
);

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

      <button
        class="w-full flex items-center gap-4 bg-gradient-to-r from-cinnabar-50 to-rice-100 border border-cinnabar-200 rounded-lg px-4 py-3 text-left hover:shadow-md transition-shadow"
        @click="router.push('/inspection')"
      >
        <div class="w-10 h-10 rounded-full bg-cinnabar-600 flex items-center justify-center shrink-0">
          <ListTodo class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-serif font-bold text-ink-800">巡检任务中心</span>
            <span v-if="openTaskCount > 0" class="text-xs px-2 py-0.5 rounded-full bg-cinnabar-600 text-white">
              {{ openTaskCount }} 项待办
            </span>
          </div>
          <div class="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-ink-500">
            <span v-if="criticalTaskCount > 0" class="flex items-center gap-1 text-orange-600">
              <AlertTriangle class="w-3.5 h-3.5" />{{ criticalTaskCount }} 项高风险待处理
            </span>
            <span v-if="blockedTaskCount > 0" class="flex items-center gap-1 text-rose-600">
              <AlertTriangle class="w-3.5 h-3.5" />{{ blockedTaskCount }} 项已阻塞
            </span>
            <span v-if="openTaskCount === 0 && blockedTaskCount === 0">暂无待办任务，一切就绪</span>
          </div>
        </div>
        <ArrowRight class="w-5 h-5 text-cinnabar-600 shrink-0" />
      </button>

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
