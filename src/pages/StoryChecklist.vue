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
  Flag,
  Plus,
  CircleDot,
  Loader,
  Ban,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import CharacterModal from '../components/CharacterModal.vue';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import { useAutoCheck } from '../composables/useAutoCheck';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import type { Character, CharacterStatus, RiskLevel, InspectionTask, TaskSeverity } from '../types';
import {
  STATUS_LABELS,
  RISK_LABELS,
  TASK_STATUS_LABELS,
  TASK_SEVERITY_LABELS,
  TASK_SOURCE_LABELS,
} from '../types';

const { characters, allStories, updateCharacter, getCharacterById } = useCharacters();
const { success, warning, error } = useToast();
const { hasMissingAccessories, getUnresolvedTaskCount, pendingTaskCountByCharacter } = useAutoCheck();
const { clearSelection } = useBatchOperations();
const {
  getTasksByStory,
  getUnresolvedTasksByCharacterId,
  resolveTask,
  updateTask,
  deleteTask,
  createManualTaskForCharacter,
  suggestResolveMissingPartTasks,
  getStoryActiveTaskStats,
  syncTasksFromCharacters,
} = useInspectionTasks();

const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const selectedStory = ref<string>('');
const filterMode = ref<'all' | 'incomplete' | 'risk'>('all');
const editingId = ref<string | null>(null);
const editStatus = ref<CharacterStatus>('pending_assembly');
const editRepairNote = ref('');
const expandedIds = ref<Set<string>>(new Set());

const showQuickTaskFor = ref<string | null>(null);
const quickTaskTitle = ref('');
const quickTaskDescription = ref('');
const quickTaskSeverity = ref<TaskSeverity>('medium');

const taskFilter = ref<'active' | 'all'>('active');

onMounted(() => {
  clearSelection();
  syncTasksFromCharacters(characters.value, []);
});

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
      const hasPendingTasks = getUnresolvedTaskCount(c.id) > 0;
      return hasRisk || hasParts || noOwner || hasPendingTasks;
    });
  }
  return chars;
});

const storyTaskStats = computed(() => {
  if (!selectedStory.value) {
    return { total: 0, open: 0, inProgress: 0, blocked: 0, critical: 0, high: 0 };
  }
  return getStoryActiveTaskStats(selectedStory.value);
});

const storyTasks = computed<InspectionTask[]>(() => {
  if (!selectedStory.value) return [];
  const list = getTasksByStory(selectedStory.value);
  if (taskFilter.value === 'active') {
    return list.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked');
  }
  return list;
});

const riskFilterCount = computed(() => {
  return storyCharacters.value.filter(c => {
    const hasRisk = c.riskLevel === 'high' || c.riskLevel === 'critical';
    const hasParts = c.status === 'need_parts';
    const noOwner = !c.owner;
    const hasPendingTasks = getUnresolvedTaskCount(c.id) > 0;
    return hasRisk || hasParts || noOwner || hasPendingTasks;
  }).length;
});

function getCharacterTasks(charId: string): InspectionTask[] {
  if (taskFilter.value === 'active') {
    return getUnresolvedTasksByCharacterId(charId);
  }
  return getTasksByStory(selectedStory.value).filter(t => t.characterId === charId);
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

  if (prevStatus === 'need_parts' && editStatus.value === 'ready_to_pack') {
    const updatedChar = getCharacterById(char.id);
    if (updatedChar) {
      const resolved = suggestResolveMissingPartTasks(updatedChar);
      if (resolved.length > 0) {
        success(`已更新「${char.name}」，并自动解决 ${resolved.length} 个相关补件任务`);
      } else {
        success(`已更新「${char.name}」的状态和备注`);
      }
      const remaining = getUnresolvedTaskCount(char.id);
      if (remaining > 0) {
        warning(`「${char.name}」仍有 ${remaining} 个未解决任务（含手写或非补件任务），请前往巡检任务中心确认`);
      }
    } else {
      success(`已更新「${char.name}」的状态和备注`);
    }
  } else {
    success(`已更新「${char.name}」的状态和备注`);
  }
  editingId.value = null;
}

function quickStatus(char: Character, status: CharacterStatus) {
  const prevStatus = char.status;
  updateCharacter(char.id, { status });

  if (prevStatus === 'need_parts' && status === 'ready_to_pack') {
    const updatedChar = getCharacterById(char.id);
    if (updatedChar) {
      const resolved = suggestResolveMissingPartTasks(updatedChar);
      if (resolved.length > 0) {
        success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」，并自动解决 ${resolved.length} 个补件任务`);
      } else {
        success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」`);
      }
      const remaining = getUnresolvedTaskCount(char.id);
      if (remaining > 0) {
        warning(`「${char.name}」仍有 ${remaining} 个未解决任务（不会自动关闭手写任务）`);
      }
    } else {
      success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」`);
    }
  } else {
    success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」`);
  }
}

function openQuickTask(char: Character) {
  showQuickTaskFor.value = char.id;
  quickTaskTitle.value = '';
  quickTaskDescription.value = '';
  quickTaskSeverity.value = 'medium';
}

function cancelQuickTask() {
  showQuickTaskFor.value = null;
  quickTaskTitle.value = '';
  quickTaskDescription.value = '';
}

function submitQuickTask(char: Character) {
  if (!quickTaskTitle.value.trim()) {
    error('请填写任务标题');
    return;
  }
  createManualTaskForCharacter(char, {
    title: quickTaskTitle.value.trim(),
    description: quickTaskDescription.value.trim(),
    severity: quickTaskSeverity.value,
    assignee: char.owner || '',
  });
  success('巡检任务已创建');
  cancelQuickTask();
}

function handleResolveTask(taskId: string) {
  resolveTask(taskId);
  success('任务已标记为解决');
}

function handleDeleteTask(taskId: string) {
  if (confirm('确定删除该巡检任务？')) {
    deleteTask(taskId);
    success('任务已删除');
  }
}

function cycleTaskStatus(task: InspectionTask) {
  const order: InspectionTask['status'][] = ['open', 'in_progress', 'blocked'];
  const idx = order.indexOf(task.status as any);
  const next = order[(idx + 1) % order.length];
  updateTask(task.id, { status: next });
}

function getTaskStatusClass(status: InspectionTask['status']): string {
  const map: Record<string, string> = {
    open: 'bg-blue-50 text-blue-700 border-blue-200',
    in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
    blocked: 'bg-red-50 text-red-700 border-red-200',
    resolved: 'bg-green-50 text-green-700 border-green-200',
    dismissed: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return map[status] || map.open;
}

function getTaskSeverityClass(severity: TaskSeverity): string {
  const map: Record<TaskSeverity, string> = {
    low: 'bg-gray-100 text-gray-700 border-gray-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  };
  return map[severity];
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
                仅看风险项 ({{ riskFilterCount }})
              </button>
            </div>
          </div>

          <div class="bg-gradient-to-br from-cinnabar-50/60 to-rice-50 rounded-lg border border-cinnabar-200/70 overflow-hidden">
            <div class="flex items-center justify-between gap-3 px-4 py-3 bg-white/60 border-b border-cinnabar-200/60">
              <div class="flex items-center gap-2">
                <Flag class="w-4 h-4 text-cinnabar-700" />
                <h3 class="font-serif text-base font-bold text-ink-800">巡检待办</h3>
                <span v-if="storyTaskStats.total > 0" class="text-xs text-ink-500">
                  「{{ selectedStory }}」共 <span class="font-bold text-cinnabar-700">{{ storyTaskStats.total }}</span> 个活跃任务
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex items-center gap-1 text-xs">
                  <button
                    :class="[
                      'px-2 py-1 rounded border transition-all',
                      taskFilter === 'active'
                        ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                        : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                    ]"
                    @click="taskFilter = 'active'"
                  >
                    活跃
                  </button>
                  <button
                    :class="[
                      'px-2 py-1 rounded border transition-all',
                      taskFilter === 'all'
                        ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                        : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                    ]"
                    @click="taskFilter = 'all'"
                  >
                    全部
                  </button>
                </div>
                <router-link
                  to="/inspection"
                  class="inline-flex items-center gap-1 text-xs text-cinnabar-700 hover:text-cinnabar-800 font-medium"
                >
                  任务中心
                  <ExternalLink class="w-3 h-3" />
                </router-link>
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-b border-cinnabar-200/50 bg-white/30">
              <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-white/70 border border-blue-200">
                <CircleDot class="w-4 h-4 text-blue-600" />
                <div>
                  <div class="text-lg font-bold text-blue-700 leading-none">{{ storyTaskStats.open }}</div>
                  <div class="text-[11px] text-ink-500 mt-0.5">待处理</div>
                </div>
              </div>
              <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-white/70 border border-amber-200">
                <Loader class="w-4 h-4 text-amber-600" />
                <div>
                  <div class="text-lg font-bold text-amber-700 leading-none">{{ storyTaskStats.inProgress }}</div>
                  <div class="text-[11px] text-ink-500 mt-0.5">进行中</div>
                </div>
              </div>
              <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-white/70 border border-red-200">
                <Ban class="w-4 h-4 text-red-600" />
                <div>
                  <div class="text-lg font-bold text-red-700 leading-none">{{ storyTaskStats.blocked }}</div>
                  <div class="text-[11px] text-ink-500 mt-0.5">已阻塞</div>
                </div>
              </div>
              <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-white/70 border border-orange-200">
                <AlertTriangle class="w-4 h-4 text-orange-600" />
                <div>
                  <div class="text-lg font-bold text-orange-700 leading-none">{{ storyTaskStats.critical + storyTaskStats.high }}</div>
                  <div class="text-[11px] text-ink-500 mt-0.5">高/严重</div>
                </div>
              </div>
            </div>

            <div v-if="storyTasks.length === 0" class="p-6 text-center text-ink-400 text-sm">
              <CheckCircle2 class="w-8 h-8 mx-auto mb-2 text-bamboo-500/50" />
              {{ taskFilter === 'active' ? '该故事暂无活跃巡检任务' : '该故事暂无巡检任务' }}
            </div>
            <div v-else class="p-3 space-y-2 max-h-80 overflow-y-auto">
              <div
                v-for="task in storyTasks"
                :key="task.id"
                :class="[
                  'p-3 rounded-md border bg-white/80 transition-all hover:shadow-sm',
                  task.status === 'blocked' ? 'border-red-200' : task.status === 'resolved' ? 'border-green-200 opacity-70' : task.status === 'dismissed' ? 'border-gray-200 opacity-60' : 'border-ink-200'
                ]"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap mb-1">
                      <span
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                        :class="getTaskStatusClass(task.status)"
                      >
                        {{ TASK_STATUS_LABELS[task.status] }}
                      </span>
                      <span
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                        :class="getTaskSeverityClass(task.severity)"
                      >
                        {{ TASK_SEVERITY_LABELS[task.severity] }}
                      </span>
                      <span class="text-[10px] text-ink-400">{{ TASK_SOURCE_LABELS[task.sourceType] }}</span>
                    </div>
                    <div
                      class="text-sm font-medium text-ink-800 leading-snug"
                      :class="{ 'line-through text-ink-400': task.status === 'resolved' || task.status === 'dismissed' }"
                    >
                      {{ task.title }}
                    </div>
                    <div v-if="task.description" class="text-xs text-ink-500 mt-1 line-clamp-2">{{ task.description }}</div>
                    <div class="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400">
                      <span v-if="task.assignee" class="inline-flex items-center gap-1">
                        <User class="w-3 h-3" />{{ task.assignee }}
                      </span>
                      <span v-if="task.dueAt" class="inline-flex items-center gap-1">
                        <Clock class="w-3 h-3" />{{ new Date(task.dueAt).toLocaleDateString() }}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                      class="p-1 text-green-600 hover:bg-green-50 rounded"
                      title="标记解决"
                      @click="handleResolveTask(task.id)"
                    >
                      <CheckCircle2 class="w-4 h-4" />
                    </button>
                    <button
                      v-if="task.status === 'open' || task.status === 'in_progress' || task.status === 'blocked'"
                      class="p-1 text-ink-500 hover:bg-ink-50 rounded"
                      title="切换状态（待处理→进行中→阻塞）"
                      @click="cycleTaskStatus(task)"
                    >
                      <Loader class="w-4 h-4" />
                    </button>
                    <button
                      class="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="删除任务"
                      @click="handleDeleteTask(task.id)"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
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
                      >
                        <Flag class="w-3 h-3" />
                        {{ getUnresolvedTaskCount(char.id) }} 个待办
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

                      <div class="pt-2 border-t border-rice-100 space-y-2">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                            <Flag class="w-3.5 h-3.5 text-cinnabar-600" />
                            巡检任务
                            <span
                              v-if="getCharacterTasks(char.id).length > 0"
                              class="text-ink-400"
                            >
                              （{{ getCharacterTasks(char.id).length }}）
                            </span>
                          </div>
                          <button
                            v-if="showQuickTaskFor !== char.id"
                            class="inline-flex items-center gap-1 text-xs text-cinnabar-700 hover:text-cinnabar-800 font-medium"
                            @click.stop="openQuickTask(char)"
                          >
                            <Plus class="w-3 h-3" />
                            新建任务
                          </button>
                        </div>

                        <div v-if="showQuickTaskFor === char.id" class="p-2.5 rounded-md bg-cinnabar-50/50 border border-cinnabar-200 space-y-2">
                          <input
                            v-model="quickTaskTitle"
                            type="text"
                            placeholder="任务标题，如：演出前再次检查金箍棒连接"
                            class="w-full px-2.5 py-1.5 text-xs border border-ink-200 rounded focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30 focus:border-cinnabar-500"
                            @click.stop
                          />
                          <textarea
                            v-model="quickTaskDescription"
                            rows="2"
                            placeholder="任务描述（可选）"
                            class="w-full px-2.5 py-1.5 text-xs border border-ink-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30 focus:border-cinnabar-500"
                            @click.stop
                          ></textarea>
                          <div class="flex items-center justify-between gap-2">
                            <select
                              v-model="quickTaskSeverity"
                              class="px-2 py-1 text-xs border border-ink-200 rounded bg-white focus:outline-none"
                              @click.stop
                            >
                              <option value="low">低</option>
                              <option value="medium">中</option>
                              <option value="high">高</option>
                              <option value="critical">严重</option>
                            </select>
                            <div class="flex items-center gap-1.5">
                              <button class="px-2 py-1 text-xs text-ink-500 hover:text-ink-700" @click.stop="cancelQuickTask">取消</button>
                              <button class="px-2.5 py-1 text-xs bg-cinnabar-700 text-white rounded hover:bg-cinnabar-800" @click.stop="submitQuickTask(char)">创建</button>
                            </div>
                          </div>
                        </div>

                        <div v-if="getCharacterTasks(char.id).length > 0" class="space-y-1.5">
                          <div
                            v-for="task in getCharacterTasks(char.id)"
                            :key="task.id"
                            :class="[
                              'p-2 rounded-md border text-xs',
                              task.status === 'blocked'
                                ? 'bg-red-50/60 border-red-200'
                                : task.status === 'resolved'
                                ? 'bg-green-50/60 border-green-200 opacity-70'
                                : task.status === 'dismissed'
                                ? 'bg-gray-50 border-gray-200 opacity-60'
                                : 'bg-white border-ink-200'
                            ]"
                          >
                            <div class="flex items-start justify-between gap-2">
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1 flex-wrap mb-0.5">
                                  <span
                                    class="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium border"
                                    :class="getTaskStatusClass(task.status)"
                                  >
                                    {{ TASK_STATUS_LABELS[task.status] }}
                                  </span>
                                  <span
                                    class="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium border"
                                    :class="getTaskSeverityClass(task.severity)"
                                  >
                                    {{ TASK_SEVERITY_LABELS[task.severity] }}
                                  </span>
                                  <span class="text-[10px] text-ink-400">{{ TASK_SOURCE_LABELS[task.sourceType] }}</span>
                                </div>
                                <div
                                  class="font-medium text-ink-800 leading-snug"
                                  :class="{ 'line-through text-ink-400': task.status === 'resolved' || task.status === 'dismissed' }"
                                >
                                  {{ task.title }}
                                </div>
                                <div v-if="task.description" class="text-ink-500 mt-0.5 line-clamp-2">{{ task.description }}</div>
                                <div class="flex items-center gap-2 mt-1 text-[10px] text-ink-400">
                                  <span v-if="task.assignee" class="inline-flex items-center gap-0.5">
                                    <User class="w-2.5 h-2.5" />{{ task.assignee }}
                                  </span>
                                  <span v-if="task.dueAt" class="inline-flex items-center gap-0.5">
                                    <Clock class="w-2.5 h-2.5" />{{ new Date(task.dueAt).toLocaleDateString() }}
                                  </span>
                                </div>
                              </div>
                              <div class="flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                                  class="p-0.5 text-green-600 hover:bg-green-100 rounded"
                                  title="标记解决"
                                  @click.stop="handleResolveTask(task.id)"
                                >
                                  <CheckCircle2 class="w-3.5 h-3.5" />
                                </button>
                                <button
                                  v-if="task.status === 'open' || task.status === 'in_progress' || task.status === 'blocked'"
                                  class="p-0.5 text-ink-500 hover:bg-ink-100 rounded"
                                  title="切换状态"
                                  @click.stop="cycleTaskStatus(task)"
                                >
                                  <Loader class="w-3.5 h-3.5" />
                                </button>
                                <button
                                  class="p-0.5 text-red-500 hover:bg-red-100 rounded"
                                  title="删除"
                                  @click.stop="handleDeleteTask(task.id)"
                                >
                                  <Trash2 class="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div v-else-if="showQuickTaskFor !== char.id" class="text-xs text-ink-400 italic">
                          该角色暂无巡检任务
                        </div>
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
