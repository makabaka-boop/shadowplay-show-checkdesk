<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Wrench,
  Play,
  PackageX,
  AlertTriangle,
  Filter,
  Edit3,
  Check,
  X,
  Save,
  User,
  AlertCircle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Plus,
  ArrowUpRight,
  Trash2,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import CharacterModal from '../components/CharacterModal.vue';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import { useAutoCheck } from '../composables/useAutoCheck';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import type { Character, CharacterStatus, RiskLevel, InspectionTask, InspectionSeverity } from '../types';
import {
  STATUS_LABELS,
  RISK_LABELS,
  INSPECTION_SEVERITY_LABELS,
  INSPECTION_STATUS_LABELS,
} from '../types';

const router = useRouter();
const { characters, allStories, updateCharacter, getCharacterById } = useCharacters();
const { success, warning, info } = useToast();
const { hasMissingAccessories, getUnresolvedTaskCount } = useAutoCheck();
const { clearSelection } = useBatchOperations();
const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  resolveTask,
  getTasksByStory,
  getUnresolvedTasksByCharacterId,
  getMissingPartTasksForCharacter,
  createAutoTasksForCharacter,
} = useInspectionTasks();

const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const selectedStory = ref<string>('');
const filterMode = ref<'all' | 'incomplete' | 'risk'>('all');
const editingId = ref<string | null>(null);
const editStatus = ref<CharacterStatus>('pending_assembly');
const editRepairNote = ref('');
const expandedIds = ref<Set<string>>(new Set());

onMounted(() => {
  clearSelection();
  // 进入清单时静默补齐角色清单的自动巡检任务（只创建缺失，不覆盖用户改动）
  createStorySilentTasks();
});

function createStorySilentTasks() {
  characters.value.forEach(c => createAutoTasksForCharacter(c));
}

const visibleIds = computed(() => filteredCharacters.value.map(c => c.id));

watch(allStories, (stories) => {
  if (stories.length > 0 && !selectedStory.value) {
    selectedStory.value = stories[0];
  }
}, { immediate: true });

const storyCharacters = computed(() => {
  if (!selectedStory.value) return [];
  return characters.value
    .filter(c => c.story === selectedStory.value)
    .sort((a, b) => a.demoOrder - b.demoOrder);
});

const storyStats = computed(() => {
  const chars = storyCharacters.value;
  return {
    total: chars.length,
    pendingAssembly: chars.filter(c => c.status === 'pending_assembly').length,
    pendingDemo: chars.filter(c => c.status === 'pending_demo').length,
    needParts: chars.filter(c => c.status === 'need_parts').length,
    highRisk: chars.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length,
    completed: chars.filter(c => c.status === 'completed').length,
    readyToPack: chars.filter(c => c.status === 'ready_to_pack').length,
    unassignedOwners: chars.filter(c => !c.owner).length,
  };
});

const filteredCharacters = computed(() => {
  let chars = [...storyCharacters.value];
  if (filterMode.value === 'incomplete') {
    chars = chars.filter(c => c.status !== 'completed' && c.status !== 'ready_to_pack');
  } else if (filterMode.value === 'risk') {
    chars = chars.filter(c => {
      const hasRisk = c.riskLevel === 'high' || c.riskLevel === 'critical';
      const hasParts = c.status === 'need_parts';
      const noOwner = !c.owner;
      const hasUnresolvedTasks = getUnresolvedTaskCount(c.id) > 0;
      return hasRisk || hasParts || noOwner || hasUnresolvedTasks;
    });
  }
  return chars;
});

// ==================== 巡检待办工作区 ====================

// 当前故事下的巡检任务（依赖 tasks.value 以保持响应式）
const storyTasks = computed(() => {
  void tasks.value;
  return selectedStory.value ? getTasksByStory(selectedStory.value) : [];
});

const storyTaskSummary = computed(() => {
  const list = storyTasks.value;
  return {
    open: list.filter(t => t.status === 'open').length,
    inProgress: list.filter(t => t.status === 'in_progress').length,
    blocked: list.filter(t => t.status === 'blocked').length,
    unresolved: list.filter(
      t => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked'
    ).length,
  };
});

// 未解决（open/in_progress/blocked）任务列表，供工作区摘要展示
const storyUnresolvedTasks = computed(() =>
  storyTasks.value
    .filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
);

const severityOrder: Record<InspectionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function unresolvedTasksOf(char: Character): InspectionTask[] {
  void tasks.value;
  return getUnresolvedTasksByCharacterId(char.id)
    .slice()
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function characterName(id: string): string {
  return getCharacterById(id)?.name ?? '';
}

// 补齐当前故事所有角色的自动任务
function syncStoryTasks() {
  let created = 0;
  storyCharacters.value.forEach(c => {
    created += createAutoTasksForCharacter(c);
  });
  if (created > 0) {
    success(`已为「${selectedStory.value}」补齐 ${created} 个巡检任务`);
  } else {
    info('该故事暂无需要新增的巡检任务');
  }
}

// 角色展开区：直接处理任务
function advanceTask(task: InspectionTask) {
  updateTask(task.id, { status: 'in_progress' });
  info(`任务已进入处理中：${task.title}`);
}

function resolveTaskInline(task: InspectionTask) {
  resolveTask(task.id);
  success(`已解决任务：${task.title}`);
}

function dismissTask(task: InspectionTask) {
  updateTask(task.id, { status: 'dismissed' });
  info(`已忽略任务：${task.title}`);
}

function removeTask(task: InspectionTask) {
  deleteTask(task.id);
  success('任务已删除');
}

function jumpToInspectionCenter() {
  router.push('/inspection');
}

// 角色展开区：手工创建任务（sourceType='manual'，关联当前角色以便反查故事与来源）
const creatingTaskFor = ref<string | null>(null);
const draftTaskTitle = ref('');
const draftTaskSeverity = ref<InspectionSeverity>('medium');
const draftTaskDescription = ref('');

function startCreateTask(char: Character) {
  creatingTaskFor.value = char.id;
  draftTaskTitle.value = '';
  draftTaskSeverity.value = 'medium';
  draftTaskDescription.value = '';
}

function cancelCreateTask() {
  creatingTaskFor.value = null;
}

function submitCreateTask(char: Character) {
  if (!draftTaskTitle.value.trim()) {
    info('请填写任务标题');
    return;
  }
  addTask({
    sourceType: 'manual',
    sourceId: '',
    story: char.story,
    characterId: char.id,
    planId: '',
    title: draftTaskTitle.value.trim(),
    description: draftTaskDescription.value.trim(),
    severity: draftTaskSeverity.value,
    status: 'open',
    assignee: char.owner || '',
  });
  success(`已为「${char.name}」创建巡检任务`);
  creatingTaskFor.value = null;
}

// ==================== 状态变更建议横幅 ====================
// need_parts → ready_to_pack 时，仅建议解决自动生成的补件任务，不自动关闭用户手写任务
interface ResolveSuggestion {
  char: Character;
  tasks: InspectionTask[];
}
const resolveSuggestion = ref<ResolveSuggestion | null>(null);

function maybeSuggestResolveMissingParts(char: Character, prevStatus: CharacterStatus, nextStatus: CharacterStatus) {
  if (prevStatus === 'need_parts' && nextStatus === 'ready_to_pack') {
    const partTasks = getMissingPartTasksForCharacter(char);
    if (partTasks.length > 0) {
      resolveSuggestion.value = { char, tasks: partTasks };
    }
  }
}

function acceptResolveSuggestion() {
  if (!resolveSuggestion.value) return;
  const { char, tasks: partTasks } = resolveSuggestion.value;
  partTasks.forEach(t => resolveTask(t.id));
  success(`已解决「${char.name}」的 ${partTasks.length} 个补件任务`);
  resolveSuggestion.value = null;
}

function dismissResolveSuggestion() {
  resolveSuggestion.value = null;
}


const incompleteCount = computed(() => {
  return storyCharacters.value.filter(c => c.status !== 'completed' && c.status !== 'ready_to_pack').length;
});

const completionPercentage = computed(() => {
  const total = storyStats.value.total;
  if (total === 0) return 0;
  const done = storyStats.value.completed + storyStats.value.readyToPack;
  return Math.round((done / total) * 100);
});

function getGapSummary(char: Character): string[] {
  const gaps: string[] = [];
  char.missingAccessories.forEach(a => {
    if (a.available < a.required) {
      gaps.push(`${a.name}缺${a.required - a.available}`);
    }
  });
  return gaps;
}

function getKeyReminders(char: Character): string[] {
  const reminders: string[] = [];
  if (char.riskNote) {
    reminders.push(`风险: ${char.riskNote}`);
  }
  if (char.repairNote && char.status === 'need_parts') {
    reminders.push(`修备: ${char.repairNote}`);
  }
  char.operationReminders.slice(0, 2).forEach(r => {
    reminders.push(`提醒: ${r}`);
  });
  if (!char.owner) {
    reminders.push('⚠ 未指定责任人');
  }
  return reminders;
}

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  expandedIds.value = new Set(expandedIds.value);
}

function startEdit(char: Character) {
  editingId.value = char.id;
  editStatus.value = char.status;
  editRepairNote.value = char.repairNote;
}

function cancelEdit() {
  editingId.value = null;
  editRepairNote.value = '';
}

function saveEdit(char: Character) {
  const prevStatus = char.status;
  updateCharacter(char.id, {
    status: editStatus.value,
    repairNote: editRepairNote.value,
  });
  success(`已更新「${char.name}」的状态和备注`);
  maybeSuggestResolveMissingParts(char, prevStatus, editStatus.value);
  editingId.value = null;
}

function quickStatus(char: Character, status: CharacterStatus) {
  const prevStatus = char.status;
  updateCharacter(char.id, { status });
  success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」`);
  maybeSuggestResolveMissingParts(char, prevStatus, status);
}

function selectNextStory() {
  const idx = allStories.value.indexOf(selectedStory.value);
  if (idx < allStories.value.length - 1) {
    selectedStory.value = allStories.value[idx + 1];
    expandedIds.value = new Set();
  }
}

function selectPrevStory() {
  const idx = allStories.value.indexOf(selectedStory.value);
  if (idx > 0) {
    selectedStory.value = allStories.value[idx - 1];
    expandedIds.value = new Set();
  }
}

const statusColors: Record<CharacterStatus, string> = {
  pending_assembly: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_demo: 'bg-purple-50 text-purple-700 border-purple-200',
  need_parts: 'bg-red-50 text-red-700 border-red-200',
  ready_to_pack: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-gray-50 text-gray-600 border-gray-200',
};

const statusDotColors: Record<CharacterStatus, string> = {
  pending_assembly: 'bg-blue-500',
  pending_demo: 'bg-purple-500',
  need_parts: 'bg-red-500',
  ready_to_pack: 'bg-emerald-500',
  completed: 'bg-gray-400',
};

const riskColors: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const riskIconMap = {
  low: null,
  medium: AlertTriangle,
  high: AlertTriangle,
  critical: AlertOctagon,
};

const taskSeverityClass: Record<InspectionSeverity, string> = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const taskStatusClass: Record<string, string> = {
  open: 'bg-sky-50 text-sky-700 border-sky-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blocked: 'bg-rose-50 text-rose-700 border-rose-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed: 'bg-ink-100 text-ink-500 border-ink-200',
};

function goBack() {
  window.history.back();
}

function openCreate() {
  editingCharacter.value = null;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingCharacter.value = null;
}

function handleSaved() {
  // 新增角色后不需要特殊处理，数据会自动同步
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" @open-create="openCreate" />

    <main class="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary !py-1.5 !px-2.5"
            @click="goBack"
          >
            <ChevronLeft class="w-4 h-4" />
            <span class="hidden sm:inline">返回</span>
          </button>
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800">故事演出清单</h2>
        </div>
        <div class="text-xs sm:text-sm text-ink-500">
          共 {{ allStories.length }} 个故事
        </div>
      </div>

      <div v-if="allStories.length > 0" class="scroll-card overflow-hidden">
        <div class="flex items-stretch border-b border-rice-200 bg-gradient-to-r from-rice-100 to-rice-50">
          <button
            class="px-3 py-3 hover:bg-rice-200/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="allStories.indexOf(selectedStory) === 0"
            @click="selectPrevStory"
          >
            <ChevronLeft class="w-5 h-5 text-ink-600" />
          </button>
          <div class="flex-1 px-2 py-3 overflow-x-auto scrollbar-hide">
            <div class="flex items-center gap-1 sm:gap-2 min-w-max">
              <button
                v-for="story in allStories"
                :key="story"
                :class="[
                  'px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-all whitespace-nowrap border',
                  selectedStory === story
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600 shadow-md'
                    : 'bg-white text-ink-700 border-ink-200 hover:border-cinnabar-400 hover:text-cinnabar-700'
                ]"
                @click="selectedStory = story; expandedIds = new Set()"
              >
                {{ story }}
              </button>
            </div>
          </div>
          <button
            class="px-3 py-3 hover:bg-rice-200/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="allStories.indexOf(selectedStory) === allStories.length - 1"
            @click="selectNextStory"
          >
            <ChevronRight class="w-5 h-5 text-ink-600" />
          </button>
        </div>

        <div class="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <div class="bg-gradient-to-br from-ink-50 to-ink-100/50 rounded-lg p-3 sm:p-4 border border-ink-200">
              <div class="flex items-center gap-2 mb-1">
                <Users class="w-4 h-4 sm:w-5 sm:h-5 text-ink-600" />
                <span class="text-xs text-ink-500">角色总数</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-ink-800 font-serif">{{ storyStats.total }}</div>
            </div>
            <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 sm:p-4 border border-blue-200">
              <div class="flex items-center gap-2 mb-1">
                <Wrench class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                <span class="text-xs text-blue-600/80">待装配</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-blue-700 font-serif">{{ storyStats.pendingAssembly }}</div>
            </div>
            <div class="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-3 sm:p-4 border border-purple-200">
              <div class="flex items-center gap-2 mb-1">
                <Play class="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                <span class="text-xs text-purple-600/80">待演示</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-purple-700 font-serif">{{ storyStats.pendingDemo }}</div>
            </div>
            <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3 sm:p-4 border border-red-200">
              <div class="flex items-center gap-2 mb-1">
                <PackageX class="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                <span class="text-xs text-red-600/80">缺件角色</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-red-700 font-serif">{{ storyStats.needParts }}</div>
            </div>
            <div class="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-3 sm:p-4 border border-orange-200">
              <div class="flex items-center gap-2 mb-1">
                <AlertTriangle class="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                <span class="text-xs text-orange-600/80">高风险</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-orange-700 font-serif">{{ storyStats.highRisk }}</div>
            </div>
            <div class="bg-gradient-to-br from-bamboo-500/10 to-bamboo-600/10 rounded-lg p-3 sm:p-4 border border-bamboo-500/30 col-span-2 sm:col-span-3 lg:col-span-1">
              <div class="flex items-center gap-2 mb-1">
                <Check class="w-4 h-4 sm:w-5 sm:h-5 text-bamboo-600" />
                <span class="text-xs text-bamboo-600/80">准备进度</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-bamboo-700 font-serif mb-1">{{ completionPercentage }}%</div>
              <div class="w-full h-1.5 bg-bamboo-500/20 rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-bamboo-500 to-bamboo-600 rounded-full transition-all duration-500"
                  :style="{ width: completionPercentage + '%' }"
                />
              </div>
            </div>
          </div>

          <!-- 巡检待办工作区 -->
          <div class="rounded-lg border border-cinnabar-200 bg-gradient-to-br from-cinnabar-50/60 to-rice-50 p-3 sm:p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div class="flex items-center gap-2">
                <ClipboardList class="w-5 h-5 text-cinnabar-600" />
                <h3 class="font-serif font-bold text-ink-800">巡检待办</h3>
                <span class="text-xs text-ink-500">「{{ selectedStory }}」下的巡检任务摘要</span>
              </div>
              <div class="flex items-center gap-2">
                <button class="btn-secondary !py-1 !px-2.5 text-xs" @click="syncStoryTasks">
                  <Plus class="w-3.5 h-3.5" />补齐自动任务
                </button>
                <button class="btn-secondary !py-1 !px-2.5 text-xs" @click="jumpToInspectionCenter">
                  <ArrowUpRight class="w-3.5 h-3.5" />巡检任务中心
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div class="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-center">
                <div class="text-xl font-bold text-sky-700">{{ storyTaskSummary.open }}</div>
                <div class="text-xs text-sky-600/80">待处理 open</div>
              </div>
              <div class="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-center">
                <div class="text-xl font-bold text-indigo-700">{{ storyTaskSummary.inProgress }}</div>
                <div class="text-xs text-indigo-600/80">处理中 in_progress</div>
              </div>
              <div class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-center">
                <div class="text-xl font-bold text-rose-700">{{ storyTaskSummary.blocked }}</div>
                <div class="text-xs text-rose-600/80">已阻塞 blocked</div>
              </div>
              <div class="rounded-md border border-ink-200 bg-white px-3 py-2 text-center">
                <div class="text-xl font-bold text-ink-800">{{ storyTaskSummary.unresolved }}</div>
                <div class="text-xs text-ink-500">未解决合计</div>
              </div>
            </div>

            <div v-if="storyUnresolvedTasks.length === 0" class="text-center py-3 text-sm text-ink-400">
              该故事暂无未解决的巡检任务
            </div>
            <ul v-else class="space-y-1.5 max-h-48 overflow-y-auto">
              <li
                v-for="task in storyUnresolvedTasks"
                :key="task.id"
                class="flex items-center gap-2 rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-xs"
              >
                <span :class="['px-1.5 py-0.5 rounded border shrink-0', taskSeverityClass[task.severity]]">
                  {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
                </span>
                <span :class="['px-1.5 py-0.5 rounded border shrink-0', taskStatusClass[task.status]]">
                  {{ INSPECTION_STATUS_LABELS[task.status] }}
                </span>
                <span class="flex-1 min-w-0 truncate text-ink-700">{{ task.title }}</span>
                <span v-if="task.characterId" class="text-ink-400 shrink-0 hidden sm:inline">
                  {{ characterName(task.characterId) }}
                </span>
                <button
                  class="text-emerald-600 hover:text-emerald-700 shrink-0"
                  title="解决"
                  @click="resolveTaskInline(task)"
                >
                  <Check class="w-3.5 h-3.5" />
                </button>
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
            <div class="flex items-center gap-1.5 text-sm text-ink-600">
              <Filter class="w-4 h-4" />
              <span>筛选:</span>
            </div>
            <div class="flex flex-wrap gap-1 sm:gap-2">
              <button
                :class="[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  filterMode === 'all'
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="filterMode = 'all'"
              >
                全部 ({{ storyCharacters.length }})
              </button>
              <button
                :class="[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  filterMode === 'incomplete'
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="filterMode = 'incomplete'"
              >
                仅看未完成 ({{ incompleteCount }})
              </button>
              <button
                :class="[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  filterMode === 'risk'
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="filterMode = 'risk'"
              >
                仅看风险项 ({{
                  storyCharacters.filter(c =>
                    c.riskLevel === 'high' || c.riskLevel === 'critical' ||
                    c.status === 'need_parts' || !c.owner ||
                    getUnresolvedTaskCount(c.id) > 0
                  ).length
                }})
              </button>
            </div>
          </div>

          <div class="space-y-2 sm:space-y-3">
            <div v-if="filteredCharacters.length === 0" class="text-center py-12 text-ink-400 bg-rice-50 rounded-lg border border-rice-200 border-dashed">
              <p class="text-sm">{{ filterMode === 'all' ? '该故事暂无角色' : '当前筛选条件下无内容' }}</p>
            </div>

            <div
              v-for="char in filteredCharacters"
              :key="char.id"
              :class="[
                'scroll-card overflow-hidden transition-all',
                char.status === 'need_parts' ? 'ring-1 ring-red-300' : '',
                (char.riskLevel === 'high' || char.riskLevel === 'critical') ? 'ring-1 ring-orange-300' : '',
              ]"
            >
              <div
                :class="[
                  'p-3 sm:p-4 cursor-pointer select-none',
                  editingId !== char.id ? 'hover:bg-rice-50/80' : ''
                ]"
                @click="editingId !== char.id && toggleExpand(char.id)"
              >
                <div class="flex items-start gap-3">
                  <div class="flex-shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                    <span
                      :class="[
                        'w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold border-2',
                        char.demoOrder <= 3
                          ? 'bg-gold-400/20 text-gold-600 border-gold-400/40'
                          : 'bg-ink-50 text-ink-600 border-ink-200'
                      ]"
                    >
                      {{ char.demoOrder }}
                    </span>
                    <span :class="['w-2.5 h-2.5 rounded-full', statusDotColors[char.status]]" />
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-1.5">
                      <h4 class="font-serif text-base sm:text-lg font-bold text-ink-800 truncate">{{ char.name }}</h4>
                      <span :class="['tag border shrink-0', statusColors[char.status]]">
                        {{ STATUS_LABELS[char.status] }}
                      </span>
                      <span
                        v-if="char.riskLevel !== 'low'"
                        :class="['tag border shrink-0 flex items-center gap-1', riskColors[char.riskLevel]]"
                      >
                        <component :is="riskIconMap[char.riskLevel]" class="w-3 h-3" />
                        {{ RISK_LABELS[char.riskLevel] }}
                      </span>
                      <span
                        v-if="getUnresolvedTaskCount(char.id) > 0"
                        class="tag border shrink-0 flex items-center gap-1 bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200"
                        title="未解决巡检任务"
                      >
                        <ClipboardList class="w-3 h-3" />
                        {{ getUnresolvedTaskCount(char.id) }} 项待办
                      </span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-2">
                      <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                        <User class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                        <span v-if="char.owner" class="text-ink-700 truncate">{{ char.owner }}</span>
                        <span v-else class="text-red-500 font-medium">未指定责任人</span>
                      </div>

                      <div class="flex items-center gap-1.5 text-xs sm:text-sm sm:col-span-2">
                        <PackageX v-if="getGapSummary(char).length > 0" class="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span v-else class="w-3.5 h-3.5 flex-shrink-0" />
                        <template v-if="getGapSummary(char).length > 0">
                          <span class="text-red-600 font-medium">{{ getGapSummary(char).join('，') }}</span>
                        </template>
                        <template v-else>
                          <span class="text-bamboo-600">配件齐全</span>
                        </template>
                      </div>
                    </div>

                    <div v-if="expandedIds.has(char.id)" class="mt-3 space-y-2 animate-fade-in">
                      <div
                        v-for="(reminder, idx) in getKeyReminders(char)"
                        :key="idx"
                        :class="[
                          'flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm border',
                          reminder.includes('风险')
                            ? 'bg-orange-50 border-orange-200 text-orange-700'
                            : reminder.includes('⚠')
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : reminder.includes('修备')
                            ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                            : 'bg-blue-50 border-blue-200 text-blue-700'
                        ]"
                      >
                        <AlertTriangle v-if="reminder.includes('风险')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <AlertCircle v-else-if="reminder.includes('⚠')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <AlertTriangle v-else-if="reminder.includes('修备')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <AlertCircle v-else class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{{ reminder }}</span>
                      </div>

                      <div v-if="editingId !== char.id" class="flex flex-wrap gap-2 pt-2 border-t border-rice-100">
                        <button
                          class="btn-secondary !py-1 !px-2.5 text-xs"
                          @click.stop="startEdit(char)"
                        >
                          <Edit3 class="w-3.5 h-3.5" />
                          更新状态/备注
                        </button>
                        <button
                          v-if="char.status === 'pending_assembly'"
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-purple-50 !text-purple-700 !border-purple-200 hover:!bg-purple-100"
                          @click.stop="quickStatus(char, 'pending_demo')"
                        >
                          → 待演示
                        </button>
                        <button
                          v-if="char.status === 'pending_demo'"
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-emerald-50 !text-emerald-700 !border-emerald-200 hover:!bg-emerald-100"
                          @click.stop="quickStatus(char, 'ready_to_pack')"
                        >
                          → 可封箱
                        </button>
                        <button
                          v-if="char.status === 'ready_to_pack'"
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-gray-100 !text-gray-700 !border-gray-200 hover:!bg-gray-200"
                          @click.stop="quickStatus(char, 'completed')"
                        >
                          → 已完成
                        </button>
                      </div>

                      <!-- 状态变更建议横幅：仅建议解决自动补件任务 -->
                      <div
                        v-if="resolveSuggestion && resolveSuggestion.char.id === char.id"
                        class="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs sm:text-sm"
                        @click.stop
                      >
                        <div class="flex items-start gap-2 text-emerald-800">
                          <Check class="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>
                            该角色已可封箱，是否解决其 {{ resolveSuggestion.tasks.length }} 个自动补件任务？
                            （用户手写任务不会被自动关闭）
                          </span>
                        </div>
                        <div class="flex flex-wrap gap-2 justify-end mt-2">
                          <button
                            class="btn-secondary !py-1 !px-2.5 text-xs"
                            @click.stop="dismissResolveSuggestion"
                          >
                            暂不处理
                          </button>
                          <button
                            class="btn-primary !py-1 !px-2.5 text-xs"
                            @click.stop="acceptResolveSuggestion"
                          >
                            <Check class="w-3.5 h-3.5" />
                            解决补件任务
                          </button>
                        </div>
                      </div>

                      <!-- 巡检任务面板 -->
                      <div class="pt-2 border-t border-rice-100" @click.stop>
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                          <div class="flex items-center gap-1.5 text-xs font-medium text-ink-600">
                            <ClipboardList class="w-3.5 h-3.5 text-cinnabar-600" />
                            巡检任务
                            <span v-if="unresolvedTasksOf(char).length > 0" class="text-cinnabar-600">
                              （{{ unresolvedTasksOf(char).length }} 项未解决）
                            </span>
                          </div>
                          <button
                            v-if="creatingTaskFor !== char.id"
                            class="btn-secondary !py-1 !px-2 text-xs"
                            @click.stop="startCreateTask(char)"
                          >
                            <Plus class="w-3.5 h-3.5" />新建任务
                          </button>
                        </div>

                        <div v-if="unresolvedTasksOf(char).length === 0" class="text-xs text-ink-400 py-1">
                          暂无未解决任务
                        </div>
                        <ul v-else class="space-y-1.5">
                          <li
                            v-for="task in unresolvedTasksOf(char)"
                            :key="task.id"
                            class="rounded-md border border-ink-100 bg-white p-2"
                          >
                            <div class="flex items-center gap-2 flex-wrap">
                              <span :class="['px-1.5 py-0.5 rounded border text-[11px]', taskSeverityClass[task.severity]]">
                                {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
                              </span>
                              <span :class="['px-1.5 py-0.5 rounded border text-[11px]', taskStatusClass[task.status]]">
                                {{ INSPECTION_STATUS_LABELS[task.status] }}
                              </span>
                              <span class="flex-1 min-w-0 text-xs text-ink-700 break-words">{{ task.title }}</span>
                            </div>
                            <p v-if="task.description" class="mt-1 text-[11px] text-ink-500 whitespace-pre-line break-words">
                              {{ task.description }}
                            </p>
                            <div class="flex flex-wrap gap-1.5 mt-1.5">
                              <button
                                v-if="task.status === 'open'"
                                class="text-[11px] px-2 py-0.5 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                @click.stop="advanceTask(task)"
                              >
                                开始处理
                              </button>
                              <button
                                class="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                @click.stop="resolveTaskInline(task)"
                              >
                                解决
                              </button>
                              <button
                                class="text-[11px] px-2 py-0.5 rounded border border-ink-200 text-ink-500 hover:bg-ink-50"
                                @click.stop="dismissTask(task)"
                              >
                                忽略
                              </button>
                              <button
                                class="text-[11px] px-2 py-0.5 rounded border border-red-200 text-red-500 hover:bg-red-50 inline-flex items-center gap-1 ml-auto"
                                @click.stop="removeTask(task)"
                              >
                                <Trash2 class="w-3 h-3" />删除
                              </button>
                            </div>
                          </li>
                        </ul>

                        <!-- 新建任务表单 -->
                        <div
                          v-if="creatingTaskFor === char.id"
                          class="mt-2 rounded-md border border-cinnabar-200 bg-rice-50 p-2.5 space-y-2"
                        >
                          <input
                            v-model="draftTaskTitle"
                            class="input-base !py-1 !text-xs"
                            placeholder="任务标题，例如「核对出场走位」"
                          />
                          <div class="flex items-center gap-2">
                            <select v-model="draftTaskSeverity" class="input-base !py-1 !text-xs !w-auto">
                              <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">
                                {{ label }}
                              </option>
                            </select>
                            <span class="text-[11px] text-ink-400">来源：手工创建 · 关联「{{ char.name }}」</span>
                          </div>
                          <textarea
                            v-model="draftTaskDescription"
                            rows="2"
                            class="input-base !py-1 !text-xs resize-none"
                            placeholder="补充说明（可选）"
                          />
                          <div class="flex justify-end gap-2">
                            <button class="btn-secondary !py-1 !px-2.5 text-xs" @click.stop="cancelCreateTask">
                              取消
                            </button>
                            <button class="btn-primary !py-1 !px-2.5 text-xs" @click.stop="submitCreateTask(char)">
                              <Check class="w-3.5 h-3.5" />创建
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    v-if="editingId !== char.id"
                    class="flex-shrink-0 p-1 rounded hover:bg-rice-200 text-ink-400 transition-colors"
                  >
                    <component :is="expandedIds.has(char.id) ? ChevronUp : ChevronDown" class="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div
                v-if="editingId === char.id"
                class="px-3 sm:px-4 pb-4 border-t border-rice-200 bg-rice-50/50 animate-slide-up"
              >
                <div class="pt-4 space-y-3">
                  <div>
                    <label class="label-base">状态</label>
                    <select v-model="editStatus" class="select-base">
                      <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="label-base">修补/补充备注</label>
                    <textarea
                      v-model="editRepairNote"
                      class="input-base resize-none"
                      rows="3"
                      placeholder="添加修补进度、补充配件信息、特殊说明等..."
                    />
                  </div>
                  <div class="flex flex-wrap gap-2 justify-end">
                    <button class="btn-secondary !py-1.5" @click="cancelEdit">
                      <X class="w-4 h-4" />
                      取消
                    </button>
                    <button class="btn-primary !py-1.5" @click="saveEdit(char)">
                      <Save class="w-4 h-4" />
                      保存更新
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="scroll-card p-12 text-center text-ink-400">
        <p>暂无故事数据</p>
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
