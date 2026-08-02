<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Flag, AlertTriangle, ArrowRight } from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import FilterPanel from '../components/FilterPanel.vue';
import CharacterTable from '../components/CharacterTable.vue';
import DetailPanel from '../components/DetailPanel.vue';
import CharacterModal from '../components/CharacterModal.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useDemoMode } from '../composables/useDemoMode';
import { onCharactersImported, useCharacters } from '../composables/useCharacters';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import type { Character } from '../types';

const router = useRouter();
const selectedId = ref<string | null>(null);
const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const { demoCharacters } = useDemoMode();
const { characters } = useCharacters();
const { rehearsalPlans } = useRehearsalPlans();
const { stats: taskStats, syncTasksFromCharacters, tasks } = useInspectionTasks();

const visibleIds = computed(() => demoCharacters.value.map(c => c.id));

const urgentTaskCount = computed(() => taskStats.value.open + taskStats.value.inProgress + taskStats.value.blocked);

const recentUrgentTasks = computed(() => {
  return tasks.value
    .filter(t => (t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked') && (t.severity === 'critical' || t.severity === 'high'))
    .slice(0, 3);
});

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
  syncTasksFromCharacters(characters.value, rehearsalPlans.value);
  onCharactersImported(() => {
    handleDataImported();
    syncTasksFromCharacters(characters.value, rehearsalPlans.value);
  });
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" @open-create="openCreate" @data-imported="handleDataImported" />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div
        v-if="urgentTaskCount > 0"
        class="bg-gradient-to-r from-cinnabar-50 to-amber-50 border border-cinnabar-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/inspection')"
      >
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-cinnabar-100 flex items-center justify-center flex-shrink-0">
              <Flag class="w-5 h-5 text-cinnabar-700" />
            </div>
            <div>
              <div class="font-semibold text-ink-800 flex items-center gap-2">
                巡检任务中心
                <span v-if="taskStats.critical > 0" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
                  <AlertTriangle class="w-3 h-3" />{{ taskStats.critical }} 个严重
                </span>
              </div>
              <div class="text-sm text-ink-600 mt-0.5">
                当前有 <span class="font-bold text-cinnabar-700">{{ urgentTaskCount }}</span> 个待处理任务
                （待处理 {{ taskStats.open }} · 进行中 {{ taskStats.inProgress }} · 阻塞 {{ taskStats.blocked }}）
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 text-cinnabar-700 font-medium text-sm">
            进入任务中心
            <ArrowRight class="w-4 h-4" />
          </div>
        </div>
        <div v-if="recentUrgentTasks.length > 0" class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="t in recentUrgentTasks"
            :key="t.id"
            class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/70 border"
            :class="t.severity === 'critical' ? 'border-red-300 text-red-700' : 'border-orange-300 text-orange-700'"
          >
            <AlertTriangle class="w-3 h-3" />
            {{ t.title }}
          </span>
        </div>
      </div>

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
