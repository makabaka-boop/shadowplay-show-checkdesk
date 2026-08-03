<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
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
  ShieldAlert,
  Clock,
  Pause,
  CheckCircle,
  Plus,
  ListChecks,
  ExternalLink,
  Trash2,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import CharacterModal from '../components/CharacterModal.vue';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import { useAutoCheck } from '../composables/useAutoCheck';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import type {
  Character,
  CharacterStatus,
  RiskLevel,
  InspectionTask,
  InspectionTaskStatus,
  InspectionSeverity,
} from '../types';
import {
  STATUS_LABELS,
  RISK_LABELS,
  INSPECTION_STATUS_LABELS,
  INSPECTION_SEVERITY_LABELS,
} from '../types';

const router = useRouter();
const { characters, allStories, updateCharacter, getCharacterById } = useCharacters();
const { success, warning, info } = useToast();
const { hasMissingAccessories, getUnresolvedTaskCountByCharacter, characterHasUnresolvedTasks } = useAutoCheck();
const { clearSelection } = useBatchOperations();
const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  resolveTask,
  getStoryTaskStats,
  getUnresolvedTasksByCharacter,
  getSuggestedResolvableTasks,
  createTaskForCharacter,
  getTasksByStory,
} = useInspectionTasks();

const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const selectedStory = ref<string>('');
const filterMode = ref<'all' | 'incomplete' | 'risk'>('all');
const editingId = ref<string | null>(null);
const editStatus = ref<CharacterStatus>('pending_assembly');
const editRepairNote = ref('');
const expandedIds = ref<Set<string>>(new Set());

const showTaskModal = ref(false);
const taskModalCharId = ref<string>('');
const taskForm = ref({
  title: '',
  description: '',
  severity: 'medium' as InspectionSeverity,
  assignee: '',
  dueAt: '',
});

const showResolveSuggestion = ref(false);
const resolveSuggestionCharId = ref<string>('');
const resolveSuggestionTasks = ref<InspectionTask[]>([]);

const taskWorkspaceFilter = ref<'' | InspectionTaskStatus>('');

onMounted(() => {
  clearSelection();
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

const storyTaskStats = computed(() => {
  if (!selectedStory.value) {
    return { total: 0, open: 0, inProgress: 0, blocked: 0, resolved: 0, dismissed: 0 };
  }
  return getStoryTaskStats(selectedStory.value);
});

const storyTasks = computed(() => {
  if (!selectedStory.value) return [];
  return getTasksByStory(selectedStory.value);
});

const unresolvedStoryTasks = computed(() => {
  return storyTasks.value.filter(
    t => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked'
  );
});

const filteredStoryTasks = computed(() => {
  if (!taskWorkspaceFilter.value) return unresolvedStoryTasks.value;
  return unresolvedStoryTasks.value.filter(t => t.status === taskWorkspaceFilter.value);
});

const riskCharCount = computed(() => {
  return storyCharacters.value.filter(c => {
    const hasRisk = c.riskLevel === 'high' || c.riskLevel === 'critical';
    const hasParts = c.status === 'need_parts';
    const noOwner = !c.owner;
    const hasTasks = characterHasUnresolvedTasks(c.id);
    return hasRisk || hasParts || noOwner || hasTasks;
  }).length;
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
      const hasTasks = characterHasUnresolvedTasks(c.id);
      return hasRisk || hasParts || noOwner || hasTasks;
    });
  }
  return chars;
});

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

function getCharTasks(charId: string): InspectionTask[] {
  return getUnresolvedTasksByCharacter(charId);
}

function getCharTaskCount(charId: string): number {
  return getUnresolvedTaskCountByCharacter(charId);
}

function getCharacterName(charId: string): string {
  if (!charId) return '';
  return getCharacterById(charId)?.name || '';
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
  const wasNeedParts = char.status === 'need_parts';
  const nowReadyToPack = editStatus.value === 'ready_to_pack';

  updateCharacter(char.id, {
    status: editStatus.value,
    repairNote: editRepairNote.value,
  });
  success(`已更新「${char.name}」的状态和备注`);
  editingId.value = null;

  if (wasNeedParts && nowReadyToPack) {
    const suggested = getSuggestedResolvableTasks(char.id);
    if (suggested.length > 0) {
      resolveSuggestionCharId.value = char.id;
      resolveSuggestionTasks.value = suggested;
      showResolveSuggestion.value = true;
    } else {
      info('状态已更新为可封箱，未发现可自动解决的补件任务');
    }
  }
}

function confirmResolveSuggested() {
  let count = 0;
  resolveSuggestionTasks.value.forEach(task => {
    resolveTask(task.id);
    count++;
  });
  success(`已解决 ${count} 个补件相关巡检任务（手工任务未受影响）`);
  showResolveSuggestion.value = false;
  resolveSuggestionTasks.value = [];
  resolveSuggestionCharId.value = '';
}

function cancelResolveSuggestion() {
  showResolveSuggestion.value = false;
  resolveSuggestionTasks.value = [];
  resolveSuggestionCharId.value = '';
  info('补件任务保留为待处理状态，可稍后在巡检任务中心处理');
}

function quickStatus(char: Character, status: CharacterStatus) {
  const wasNeedParts = char.status === 'need_parts';
  updateCharacter(char.id, { status });
  success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」`);

  if (wasNeedParts && status === 'ready_to_pack') {
    const suggested = getSuggestedResolvableTasks(char.id);
    if (suggested.length > 0) {
      resolveSuggestionCharId.value = char.id;
      resolveSuggestionTasks.value = suggested;
      showResolveSuggestion.value = true;
    }
  }
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

const taskStatusStyles: Record<InspectionTaskStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  resolved: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  dismissed: 'bg-gray-50 text-gray-500 border-gray-200',
};

const taskSeverityDot: Record<InspectionSeverity, string> = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

function getTaskStatusIcon(status: InspectionTaskStatus) {
  switch (status) {
    case 'open': return Clock;
    case 'in_progress': return Play;
    case 'blocked': return Pause;
    case 'resolved': return CheckCircle;
    case 'dismissed': return X;
  }
}

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
}

function openTaskCreate(charId: string) {
  const char = getCharacterById(charId);
  taskModalCharId.value = charId;
  taskForm.value = {
    title: '',
    description: '',
    severity: 'medium',
    assignee: char?.owner || '',
    dueAt: '',
  };
  showTaskModal.value = true;
}

function closeTaskCreate() {
  showTaskModal.value = false;
  taskModalCharId.value = '';
}

function submitTaskCreate() {
  if (!taskForm.value.title.trim()) {
    warning('请填写任务标题');
    return;
  }
  const result = createTaskForCharacter(taskModalCharId.value, {
    title: taskForm.value.title.trim(),
    description: taskForm.value.description.trim(),
    severity: taskForm.value.severity,
    assignee: taskForm.value.assignee.trim(),
    dueAt: taskForm.value.dueAt,
  });
  if (result) {
    success('巡检任务已创建');
    closeTaskCreate();
  } else {
    warning('创建失败：未找到关联角色');
  }
}

function handleQuickTaskAction(task: InspectionTask, action: 'start' | 'resolve' | 'dismiss') {
  if (action === 'start') {
    updateTask(task.id, { status: 'in_progress' });
    success(`任务「${task.title}」已开始处理`);
  } else if (action === 'resolve') {
    resolveTask(task.id);
    success(`任务「${task.title}」已标记为解决`);
  } else if (action === 'dismiss') {
    updateTask(task.id, { status: 'dismissed' });
    success(`任务「${task.title}」已忽略`);
  }
}

function handleDeleteTask(task: InspectionTask) {
  if (confirm(`确定删除任务「${task.title}」吗？`)) {
    deleteTask(task.id);
    success('任务已删除');
  }
}

function goToTaskSource(task: InspectionTask) {
  if (task.sourceType === 'handover') {
    router.push('/handover');
  } else if (task.sourceType === 'rehearsal' && task.planId) {
    router.push(`/rehearsal/${task.planId}`);
  } else {
    router.push('/');
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
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

          <div class="scroll-card !shadow-none border border-cinnabar-200/60 bg-gradient-to-r from-cinnabar-50/40 to-rice-50 overflow-hidden">
            <div class="px-4 py-3 border-b border-cinnabar-200/50 flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <ShieldAlert class="w-5 h-5 text-cinnabar-700" />
                <h3 class="font-serif text-base font-bold text-cinnabar-800">巡检待办</h3>
                <span class="tag border bg-cinnabar-100 text-cinnabar-700 border-cinnabar-200">
                  {{ unresolvedStoryTasks.length }} 项未解决
                </span>
              </div>
              <router-link
                to="/tasks"
                class="inline-flex items-center gap-1 text-xs text-cinnabar-700 hover:text-cinnabar-900 transition-colors"
              >
                <ListChecks class="w-3.5 h-3.5" />
                打开任务中心
                <ExternalLink class="w-3 h-3" />
              </router-link>
            </div>
            <div class="p-4 space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                    taskWorkspaceFilter === ''
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="taskWorkspaceFilter = ''"
                >
                  全部 ({{ unresolvedStoryTasks.length }})
                </button>
                <button
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                    taskWorkspaceFilter === 'open'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="taskWorkspaceFilter = 'open'"
                >
                  <Clock class="w-3 h-3 inline mr-1" />
                  待处理 ({{ storyTaskStats.open }})
                </button>
                <button
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                    taskWorkspaceFilter === 'in_progress'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="taskWorkspaceFilter = 'in_progress'"
                >
                  <Play class="w-3 h-3 inline mr-1" />
                  处理中 ({{ storyTaskStats.inProgress }})
                </button>
                <button
                  :class="[
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                    taskWorkspaceFilter === 'blocked'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="taskWorkspaceFilter = 'blocked'"
                >
                  <Pause class="w-3 h-3 inline mr-1" />
                  已阻塞 ({{ storyTaskStats.blocked }})
                </button>
              </div>

              <div v-if="filteredStoryTasks.length === 0" class="text-center py-6 text-ink-400 text-sm bg-rice-50/50 rounded-md border border-dashed border-rice-200">
                <CheckCircle class="w-8 h-8 mx-auto mb-2 text-bamboo-400" />
                <p>当前筛选条件下暂无巡检待办</p>
              </div>
              <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div
                  v-for="task in filteredStoryTasks"
                  :key="task.id"
                  :class="[
                    'p-3 rounded-md border bg-white transition-all hover:shadow-sm',
                    task.status === 'blocked' ? 'border-red-200 ring-1 ring-red-100' : 'border-rice-200'
                  ]"
                >
                  <div class="flex items-start gap-2">
                    <span :class="['w-2 h-2 rounded-full mt-1.5 flex-shrink-0', taskSeverityDot[task.severity]]" />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap mb-1">
                        <h5 class="text-sm font-semibold text-ink-800 truncate">{{ task.title }}</h5>
                      </div>
                      <p v-if="task.description" class="text-xs text-ink-500 line-clamp-2 mb-2">{{ task.description }}</p>
                      <div class="flex items-center gap-2 flex-wrap text-xs text-ink-400">
                        <span :class="['tag border', taskStatusStyles[task.status]]">
                          <component :is="getTaskStatusIcon(task.status)" class="w-3 h-3 mr-1" />
                          {{ INSPECTION_STATUS_LABELS[task.status] }}
                        </span>
                        <span v-if="getCharacterName(task.characterId)" class="flex items-center gap-1">
                          <User class="w-3 h-3" />
                          {{ getCharacterName(task.characterId) }}
                        </span>
                        <span v-if="task.assignee" class="flex items-center gap-1">
                          @{{ task.assignee }}
                        </span>
                        <span v-if="task.dueAt" class="flex items-center gap-1">
                          <Clock class="w-3 h-3" />
                          {{ formatDate(task.dueAt) }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1 mt-2 pt-2 border-t border-rice-100">
                        <button
                          v-if="task.status === 'open'"
                          class="p-1 rounded hover:bg-cinnabar-50 text-cinnabar-600 transition-colors"
                          title="开始处理"
                          @click="handleQuickTaskAction(task, 'start')"
                        >
                          <Play class="w-3.5 h-3.5" />
                        </button>
                        <button
                          v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                          class="p-1 rounded hover:bg-bamboo-50 text-bamboo-600 transition-colors"
                          title="标记解决"
                          @click="handleQuickTaskAction(task, 'resolve')"
                        >
                          <CheckCircle class="w-3.5 h-3.5" />
                        </button>
                        <button
                          class="p-1 rounded hover:bg-rice-200 text-ink-400 transition-colors"
                          title="查看来源"
                          @click="goToTaskSource(task)"
                        >
                          <ExternalLink class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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
                仅看风险项 ({{ riskCharCount }})
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
                        v-if="getCharTaskCount(char.id) > 0"
                        class="tag border shrink-0 flex items-center gap-1 bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200"
                      >
                        <ShieldAlert class="w-3 h-3" />
                        {{ getCharTaskCount(char.id) }} 待办
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

                      <div v-if="getCharTasks(char.id).length > 0" class="pt-2 border-t border-rice-100">
                        <div class="flex items-center gap-1.5 mb-2 text-xs font-semibold text-ink-600">
                          <ShieldAlert class="w-3.5 h-3.5 text-cinnabar-600" />
                          <span>巡检任务（{{ getCharTasks(char.id).length }}）</span>
                        </div>
                        <div class="space-y-1.5">
                          <div
                            v-for="task in getCharTasks(char.id)"
                            :key="task.id"
                            :class="[
                              'p-2 rounded-md border text-xs',
                              task.status === 'blocked'
                                ? 'bg-red-50 border-red-200'
                                : task.status === 'in_progress'
                                ? 'bg-cinnabar-50 border-cinnabar-200'
                                : 'bg-white border-rice-200'
                            ]"
                          >
                            <div class="flex items-start justify-between gap-2">
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <span :class="['w-1.5 h-1.5 rounded-full', taskSeverityDot[task.severity]]" />
                                  <span class="font-medium text-ink-800">{{ task.title }}</span>
                                  <span :class="['tag border !py-0 !px-1.5 text-[10px]', taskStatusStyles[task.status]]">
                                    {{ INSPECTION_STATUS_LABELS[task.status] }}
                                  </span>
                                </div>
                                <p v-if="task.description" class="text-ink-500 line-clamp-1">{{ task.description }}</p>
                              </div>
                            </div>
                            <div class="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-rice-100">
                              <button
                                v-if="task.status === 'open'"
                                class="p-1 rounded hover:bg-cinnabar-100 text-cinnabar-600 transition-colors"
                                title="开始处理"
                                @click.stop="handleQuickTaskAction(task, 'start')"
                              >
                                <Play class="w-3 h-3" />
                              </button>
                              <button
                                v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                                class="p-1 rounded hover:bg-bamboo-100 text-bamboo-600 transition-colors"
                                title="标记解决"
                                @click.stop="handleQuickTaskAction(task, 'resolve')"
                              >
                                <CheckCircle class="w-3 h-3" />
                              </button>
                              <button
                                class="p-1 rounded hover:bg-rice-200 text-ink-400 transition-colors ml-auto"
                                title="查看来源"
                                @click.stop="goToTaskSource(task)"
                              >
                                <ExternalLink class="w-3 h-3" />
                              </button>
                              <button
                                class="p-1 rounded hover:bg-red-100 text-red-400 transition-colors"
                                title="删除任务"
                                @click.stop="handleDeleteTask(task)"
                              >
                                <Trash2 class="w-3 h-3" />
                              </button>
                            </div>
                          </div>
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
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-cinnabar-50 !text-cinnabar-700 !border-cinnabar-200 hover:!bg-cinnabar-100"
                          @click.stop="openTaskCreate(char.id)"
                        >
                          <Plus class="w-3.5 h-3.5" />
                          新建巡检任务
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

    <div v-if="showTaskModal" class="modal-backdrop" @click.self="closeTaskCreate">
      <div class="modal-content max-w-md">
        <div class="flex items-center justify-between px-5 py-4 border-b border-rice-200 bg-gradient-to-r from-rice-100 to-rice-50">
          <h3 class="font-serif text-lg font-bold text-ink-800">新建巡检任务</h3>
          <button class="p-1 rounded hover:bg-rice-200 text-ink-500" @click="closeTaskCreate">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="label-base">任务标题 <span class="text-red-500">*</span></label>
            <input v-model="taskForm.title" type="text" class="input-base" placeholder="输入任务标题" />
          </div>
          <div>
            <label class="label-base">任务描述</label>
            <textarea
              v-model="taskForm.description"
              class="input-base resize-none"
              rows="3"
              placeholder="描述任务内容、处理要求..."
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">严重程度</label>
              <select v-model="taskForm.severity" class="select-base">
                <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div>
              <label class="label-base">负责人</label>
              <input v-model="taskForm.assignee" type="text" class="input-base" placeholder="负责人姓名" />
            </div>
          </div>
          <div>
            <label class="label-base">截止时间</label>
            <input v-model="taskForm.dueAt" type="datetime-local" class="input-base" />
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-rice-200 bg-rice-50/50">
          <button class="btn-secondary !py-1.5" @click="closeTaskCreate">
            <X class="w-4 h-4" />
            取消
          </button>
          <button class="btn-primary !py-1.5" @click="submitTaskCreate">
            <Save class="w-4 h-4" />
            创建任务
          </button>
        </div>
      </div>
    </div>

    <div v-if="showResolveSuggestion" class="modal-backdrop" @click.self="cancelResolveSuggestion">
      <div class="modal-content max-w-md">
        <div class="flex items-center justify-between px-5 py-4 border-b border-rice-200 bg-gradient-to-r from-bamboo-50 to-rice-50">
          <h3 class="font-serif text-lg font-bold text-bamboo-800 flex items-center gap-2">
            <CheckCircle class="w-5 h-5 text-bamboo-600" />
            建议解决补件任务
          </h3>
          <button class="p-1 rounded hover:bg-rice-200 text-ink-500" @click="cancelResolveSuggestion">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="px-5 py-4 space-y-3">
          <p class="text-sm text-ink-600">
            角色状态已改为「可封箱」，以下 <strong class="text-bamboo-700">{{ resolveSuggestionTasks.length }}</strong> 个由缺件自动生成的巡检任务建议标记为已解决：
          </p>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div
              v-for="task in resolveSuggestionTasks"
              :key="task.id"
              class="p-2.5 rounded-md border border-bamboo-200 bg-bamboo-50/50"
            >
              <div class="flex items-center gap-2">
                <CheckCircle class="w-4 h-4 text-bamboo-600 flex-shrink-0" />
                <span class="text-sm font-medium text-ink-800">{{ task.title }}</span>
              </div>
              <p v-if="task.description" class="text-xs text-ink-500 mt-1 ml-6">{{ task.description }}</p>
            </div>
          </div>
          <div class="p-2.5 rounded-md bg-yellow-50 border border-yellow-200">
            <p class="text-xs text-yellow-700 flex items-start gap-1.5">
              <AlertTriangle class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>仅会解决自动生成的补件任务（sourceType=character, sourceId 含 :missing:），手工创建的任务不受影响。</span>
            </p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-rice-200 bg-rice-50/50">
          <button class="btn-secondary !py-1.5" @click="cancelResolveSuggestion">
            暂不处理
          </button>
          <button class="btn-primary !py-1.5 !bg-bamboo-600 hover:!bg-bamboo-700" @click="confirmResolveSuggested">
            <CheckCircle class="w-4 h-4" />
            全部标记解决
          </button>
        </div>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
