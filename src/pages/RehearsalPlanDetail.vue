<script setup lang="ts">
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Calendar,
  MapPin,
  User,
  UserPlus,
  Play,
  Check,
  X,
  Edit3,
  Save,
  Plus,
  Trash2,
  Search,
  PackageX,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  CheckCircle,
  Clock,
  ClipboardCheck,
  ClipboardList,
  Filter,
  FileText,
  Users,
  ArrowRight,
  Wrench,
  Flag,
  CheckCircle2,
  Loader,
  Ban,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import RehearsalPlanModal from '../components/RehearsalPlanModal.vue';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import type {
  RehearsalPlan,
  RehearsalStatus,
  RehearsalResult,
  RehearsalCharacter,
  Character,
  RiskLevel,
  HandoverStatus,
  AccessoryGap,
  InspectionTask,
  TaskSeverity,
} from '../types';
import {
  REHEARSAL_STATUS_LABELS,
  REHEARSAL_RESULT_LABELS,
  RISK_LABELS,
  HANDOVER_LABELS,
  STATUS_LABELS,
  TASK_SEVERITY_LABELS,
  TASK_STATUS_LABELS,
} from '../types';

const route = useRoute();
const router = useRouter();
const {
  getPlanById,
  updatePlan,
  updateCharacterResult,
  removeCharacterFromPlan,
  addCharacterToPlan,
  moveCharacterOrder,
  getPlanStats,
  getValidPlanCharacters,
} = useRehearsalPlans();
const { characters, allStories } = useCharacters();
const { success, warning, error } = useToast();
const { clearSelection } = useBatchOperations();
const {
  getPlanTaskStats,
  getTasksByCharacterId,
  getUnresolvedTasksByCharacterId,
  resolveTask,
  updateTask,
  deleteTask,
  createManualTaskForCharacter,
  syncTasksFromCharacters,
} = useInspectionTasks();

const planId = computed(() => route.params.id as string);
const plan = computed<RehearsalPlan | undefined>(() => getPlanById(planId.value));
const planStats = computed(() => plan.value ? getPlanStats(plan.value) : null);
const planTaskStats = computed(() => plan.value ? getPlanTaskStats(plan.value.id) : null);

const showQuickTaskFor = ref<string | null>(null);
const quickTaskTitle = ref('');
const quickTaskDescription = ref('');
const quickTaskSeverity = ref<TaskSeverity>('medium');

const showModal = ref(false);
const showAddCharacter = ref(false);
const characterSearch = ref('');
const editingCharacterId = ref<string | null>(null);
const expandedIds = ref<Set<string>>(new Set());
const filterResult = ref<RehearsalResult | ''>('');

const editResultForm = reactive<{
  result: RehearsalResult;
  note: string;
  checkedBy: string;
}>({
  result: 'not_started',
  note: '',
  checkedBy: '',
});

const visibleIds = computed(() => {
  if (!plan.value) return [];
  return getValidPlanCharacters(plan.value).map(c => c.characterId);
});

onMounted(() => {
  clearSelection();
  if (plan.value) {
    syncTasksFromCharacters(characters.value, [plan.value]);
  }
});

const sortedCharacters = computed(() => {
  if (!plan.value) return [];
  let list = getValidPlanCharacters(plan.value)
    .map(vc => ({ characterId: vc.characterId, order: vc.order, rehearsalResult: vc.rehearsalResult, rehearsalNote: vc.rehearsalNote, checkedBy: vc.checkedBy }))
    .sort((a, b) => a.order - b.order);
  
  if (filterResult.value) {
    list = list.filter(c => c.rehearsalResult === filterResult.value);
  }
  
  return list;
});

const visibleCharacterIds = computed(() => sortedCharacters.value.map(c => c.characterId));

const validCharactersSorted = computed(() => {
  if (!plan.value) return [];
  return getValidPlanCharacters(plan.value)
    .map(vc => ({
      characterId: vc.characterId,
      order: vc.order,
      rehearsalResult: vc.rehearsalResult,
      rehearsalNote: vc.rehearsalNote,
      checkedBy: vc.checkedBy,
      character: vc.character,
    }))
    .sort((a, b) => a.order - b.order);
});

const availableCharacters = computed(() => {
  if (!plan.value) return [];
  const selectedIds = new Set(plan.value.characters.map(c => c.characterId));
  return characters.value
    .filter(c => c.story === plan.value!.story && !selectedIds.has(c.id))
    .filter(c => {
      if (!characterSearch.value.trim()) return true;
      const q = characterSearch.value.trim().toLowerCase();
      return c.name.toLowerCase().includes(q) || c.owner.toLowerCase().includes(q);
    })
    .sort((a, b) => a.demoOrder - b.demoOrder);
});

const riskLevelPriority: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const overallRisk = computed(() => {
  if (!plan.value) return 'low' as RiskLevel;
  const chars = getValidPlanCharacters(plan.value).map(vc => vc.character);
  if (chars.length === 0) return 'low';
  return chars.reduce((max: RiskLevel, c) => {
    return riskLevelPriority[c.riskLevel] > riskLevelPriority[max] ? c.riskLevel : max;
  }, 'low');
});

const needPartsCount = computed(() => {
  if (!plan.value) return 0;
  return getValidPlanCharacters(plan.value).filter(vc => {
    return vc.character.missingAccessories.some(a => a.available < a.required);
  }).length;
});

const highRiskCount = computed(() => {
  if (!plan.value) return 0;
  return getValidPlanCharacters(plan.value).filter(vc => {
    return vc.character.riskLevel === 'high' || vc.character.riskLevel === 'critical';
  }).length;
});

const unassignedOwnerCount = computed(() => {
  if (!plan.value) return 0;
  return getValidPlanCharacters(plan.value).filter(vc => {
    return !vc.character.owner;
  }).length;
});

const handoverSummary = computed(() => {
  if (!plan.value) return null;
  const chars = getValidPlanCharacters(plan.value).map(vc => vc.character);
  
  const hasRisk = chars.some(c => {
    const missing = c.missingAccessories.some(a => a.available < a.required);
    const high = c.riskLevel === 'high' || c.riskLevel === 'critical';
    const noOwner = !c.owner;
    return missing || high || noOwner || c.handoverStatus === 'has_risk';
  });
  const followUp = chars.some(c => c.handoverStatus === 'follow_up');
  const notChecked = chars.some(c => c.handoverStatus === 'not_checked');
  
  if (hasRisk) return { level: 'has_risk', label: '存在风险', color: 'red' };
  if (followUp) return { level: 'follow_up', label: '需跟进', color: 'yellow' };
  if (notChecked) return { level: 'not_checked', label: '未核对', color: 'gray' };
  return { level: 'confirmed', label: '可交接', color: 'bamboo' };
});

const preparationPercentage = computed(() => {
  if (!plan.value) return 0;
  const chars = getValidPlanCharacters(plan.value).map(vc => vc.character);
  if (chars.length === 0) return 0;
  const ready = chars.filter(c => c.status === 'ready_to_pack' || c.status === 'completed').length;
  return Math.round((ready / chars.length) * 100);
});

function getFullCharacter(id: string): Character | undefined {
  return characters.value.find(c => c.id === id);
}

function getGapSummary(char: Character): string[] {
  const gaps: string[] = [];
  char.missingAccessories.forEach(a => {
    if (a.available < a.required) {
      gaps.push(`${a.name}缺${a.required - a.available}`);
    }
  });
  return gaps;
}

function getPendingItems(char: Character): string[] {
  const items: string[] = [];
  if (char.repairNote) items.push(char.repairNote);
  if (char.operationReminders && char.operationReminders.length > 0) {
    items.push(...char.operationReminders.slice(0, 2));
  }
  if (char.handoverNote) items.push(`交接: ${char.handoverNote}`);
  return items;
}

function hasObjectiveRisk(char: Character): boolean {
  const missing = char.missingAccessories.some(a => a.available < a.required);
  const high = char.riskLevel === 'high' || char.riskLevel === 'critical';
  const noOwner = !char.owner;
  return missing || high || noOwner;
}

function formatDateTime(str: string): string {
  if (!str) return '';
  const d = new Date(str);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  expandedIds.value = new Set(expandedIds.value);
}

function startEditCharacter(rc: RehearsalCharacter) {
  editingCharacterId.value = rc.characterId;
  editResultForm.result = rc.rehearsalResult;
  editResultForm.note = rc.rehearsalNote;
  editResultForm.checkedBy = rc.checkedBy;
}

function cancelEdit() {
  editingCharacterId.value = null;
}

function saveEdit() {
  if (!editingCharacterId.value || !plan.value) return;
  const prev = plan.value.characters.find(c => c.characterId === editingCharacterId.value);
  updateCharacterResult(plan.value.id, editingCharacterId.value, {
    rehearsalResult: editResultForm.result,
    rehearsalNote: editResultForm.note,
    checkedBy: editResultForm.checkedBy,
  });
  if (editResultForm.result === 'fail') {
    success('已更新排练结果，并已创建/更新高严重度巡检任务');
  } else if (editResultForm.result === 'need_rehearse') {
    success('已更新排练结果，并已创建/更新中严重度巡检任务');
  } else if (editResultForm.result === 'pass' && prev && (prev.rehearsalResult === 'fail' || prev.rehearsalResult === 'need_rehearse')) {
    success('已更新排练结果，相关系统排练任务已自动解决');
  } else {
    success('已更新排练结果');
  }
  editingCharacterId.value = null;
}

function quickSetResult(rc: RehearsalCharacter, result: RehearsalResult) {
  if (!plan.value) return;
  updateCharacterResult(plan.value.id, rc.characterId, {
    rehearsalResult: result,
  });
  if (result === 'fail') {
    success(`已标记为「${REHEARSAL_RESULT_LABELS[result]}」，已创建/更新高严重度巡检任务`);
  } else if (result === 'need_rehearse') {
    success(`已标记为「${REHEARSAL_RESULT_LABELS[result]}」，已创建/更新中严重度巡检任务`);
  } else if (result === 'pass') {
    success(`已标记为「${REHEARSAL_RESULT_LABELS[result]}」`);
  } else {
    success(`已标记为「${REHEARSAL_RESULT_LABELS[result]}」`);
  }
}

function addCharacter(characterId: string) {
  if (!plan.value) return;
  addCharacterToPlan(plan.value.id, characterId);
  success('已添加角色');
  showAddCharacter.value = false;
}

function removeCharacter(characterId: string) {
  if (!plan.value) return;
  const char = getFullCharacter(characterId);
  if (!confirm(`确定移除角色「${char?.name || '未知'}」吗？关联的巡检任务将进入阻塞状态。`)) return;
  removeCharacterFromPlan(plan.value.id, characterId);
  success('已移除角色，关联巡检任务已进入阻塞状态');
}

function getCharacterTasks(characterId: string): InspectionTask[] {
  return getTasksByCharacterId(characterId).filter(t => t.planId === plan.value?.id || !t.planId);
}

function getUnresolvedCharacterTasks(characterId: string): InspectionTask[] {
  return getUnresolvedTasksByCharacterId(characterId).filter(t => t.planId === plan.value?.id);
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

function handleResolveTask(taskId: string) {
  resolveTask(taskId);
  success('巡检任务已标记为解决');
}

function handleDeleteTask(taskId: string) {
  if (confirm('确定删除该巡检任务？')) {
    deleteTask(taskId);
    success('巡检任务已删除');
  }
}

function cycleTaskStatus(task: InspectionTask) {
  const order: InspectionTask['status'][] = ['open', 'in_progress', 'blocked'];
  const idx = order.indexOf(task.status);
  const next = order[(idx + 1) % order.length];
  updateTask(task.id, { status: next });
}

function openQuickTask(characterId: string) {
  showQuickTaskFor.value = characterId;
  quickTaskTitle.value = '';
  quickTaskDescription.value = '';
  quickTaskSeverity.value = 'medium';
}

function cancelQuickTask() {
  showQuickTaskFor.value = null;
  quickTaskTitle.value = '';
  quickTaskDescription.value = '';
}

function submitQuickTask(characterId: string) {
  if (!quickTaskTitle.value.trim()) {
    error('请填写任务标题');
    return;
  }
  const char = getFullCharacter(characterId);
  if (!char) return;
  createManualTaskForCharacter(char, {
    title: quickTaskTitle.value.trim(),
    description: quickTaskDescription.value.trim(),
    severity: quickTaskSeverity.value,
    assignee: char.owner || '',
  });
  success('巡检任务已创建');
  cancelQuickTask();
}

function moveOrder(characterId: string, direction: 'up' | 'down') {
  if (!plan.value) return;
  moveCharacterOrder(
    plan.value.id,
    characterId,
    direction,
    filterResult.value ? visibleCharacterIds.value : undefined
  );
}

function goBack() {
  router.push('/rehearsal');
}

function openEdit() {
  showModal.value = true;
}

function handlePlanSaved() {
  showModal.value = false;
}

function updateStatus(status: RehearsalStatus) {
  if (!plan.value) return;
  updatePlan(plan.value.id, { status });
  success(`已更新为「${REHEARSAL_STATUS_LABELS[status]}」`);
}

const rehearsalStatusColors: Record<RehearsalStatus, string> = {
  draft: 'bg-gray-50 text-gray-700 border-gray-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const rehearsalResultColors: Record<RehearsalResult, string> = {
  not_started: 'bg-gray-50 text-gray-600 border-gray-200',
  pass: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  fail: 'bg-red-50 text-red-700 border-red-200',
  need_rehearse: 'bg-orange-50 text-orange-700 border-orange-200',
};

const rehearsalResultDotColors: Record<RehearsalResult, string> = {
  not_started: 'bg-gray-400',
  pass: 'bg-bamboo-500',
  fail: 'bg-red-500',
  need_rehearse: 'bg-orange-500',
};

const riskColors: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const handoverColors: Record<HandoverStatus, string> = {
  not_checked: 'bg-gray-50 text-gray-600 border-gray-200',
  confirmed: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  follow_up: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  has_risk: 'bg-red-50 text-red-700 border-red-200',
};

const riskIconMap = {
  low: null,
  medium: AlertTriangle,
  high: AlertTriangle,
  critical: AlertOctagon,
};
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" />

    <main v-if="plan" class="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 min-w-0">
          <button class="btn-secondary !py-1.5 !px-2.5" @click="goBack">
            <ChevronLeft class="w-4 h-4" />
            <span class="hidden sm:inline">返回列表</span>
          </button>
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800 truncate">{{ plan.name }}</h2>
          <span :class="['tag border shrink-0', rehearsalStatusColors[plan.status]]">
            {{ REHEARSAL_STATUS_LABELS[plan.status] }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="plan.status"
            class="select-base !w-auto !py-1.5 text-sm"
            @change="updateStatus(($event.target as HTMLSelectElement).value as RehearsalStatus)"
          >
            <option v-for="(label, key) in REHEARSAL_STATUS_LABELS" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
          <button class="btn-secondary !py-1.5" @click="openEdit">
            <Edit3 class="w-4 h-4" />
            <span class="hidden sm:inline">编辑场次</span>
          </button>
        </div>
      </div>

      <div class="scroll-card p-4 sm:p-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Calendar class="w-5 h-5 text-blue-600" />
            </div>
            <div class="min-w-0">
              <div class="text-xs text-ink-400 mb-0.5">排练时间</div>
              <div class="font-medium text-ink-800 text-sm sm:text-base">{{ formatDateTime(plan.scheduledAt) }}</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <MapPin class="w-5 h-5 text-green-600" />
            </div>
            <div class="min-w-0">
              <div class="text-xs text-ink-400 mb-0.5">排练场地</div>
              <div class="font-medium text-ink-800 text-sm sm:text-base">{{ plan.venue || '未指定' }}</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <User class="w-5 h-5 text-purple-600" />
            </div>
            <div class="min-w-0">
              <div class="text-xs text-ink-400 mb-0.5">场次责任人</div>
              <div class="font-medium text-ink-800 text-sm sm:text-base">{{ plan.owner || '未指定' }}</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-gold-400/20 flex items-center justify-center flex-shrink-0">
              <ClipboardList class="w-5 h-5 text-gold-600" />
            </div>
            <div class="min-w-0">
              <div class="text-xs text-ink-400 mb-0.5">所属故事</div>
              <div class="font-medium text-ink-800 text-sm sm:text-base">{{ plan.story }}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2 sm:gap-3 pt-4 border-t border-rice-200">
          <div class="bg-gradient-to-br from-ink-50 to-ink-100/50 rounded-lg p-3 border border-ink-200">
            <div class="flex items-center gap-1.5 mb-1">
              <Users class="w-3.5 h-3.5 text-ink-500" />
              <span class="text-[11px] text-ink-500">角色总数</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-ink-800 font-serif">{{ planStats?.total || 0 }}</div>
          </div>
          <div class="bg-gradient-to-br from-bamboo-50 to-bamboo-100/50 rounded-lg p-3 border border-bamboo-200">
            <div class="flex items-center gap-1.5 mb-1">
              <CheckCircle class="w-3.5 h-3.5 text-bamboo-600" />
              <span class="text-[11px] text-bamboo-600/80">排练通过</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-bamboo-700 font-serif">{{ planStats?.pass || 0 }}</div>
          </div>
          <div class="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-3 border border-orange-200">
            <div class="flex items-center gap-1.5 mb-1">
              <Clock class="w-3.5 h-3.5 text-orange-600" />
              <span class="text-[11px] text-orange-600/80">需复排</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-orange-700 font-serif">{{ planStats?.needRehearse || 0 }}</div>
          </div>
          <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3 border border-red-200">
            <div class="flex items-center gap-1.5 mb-1">
              <X class="w-3.5 h-3.5 text-red-600" />
              <span class="text-[11px] text-red-600/80">未通过</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-red-700 font-serif">{{ planStats?.fail || 0 }}</div>
          </div>
          <div class="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg p-3 border border-gray-200">
            <div class="flex items-center gap-1.5 mb-1">
              <Play class="w-3.5 h-3.5 text-gray-500" />
              <span class="text-[11px] text-gray-500">未开始</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-gray-700 font-serif">{{ planStats?.notStarted || 0 }}</div>
          </div>
          <div class="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-3 border border-purple-200 col-span-2 sm:col-span-2 lg:col-span-1">
            <div class="flex items-center gap-1.5 mb-1">
              <ClipboardCheck class="w-3.5 h-3.5 text-purple-600" />
              <span class="text-[11px] text-purple-600/80">排练进度</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-purple-700 font-serif mb-1">{{ planStats?.progress || 0 }}%</div>
            <div class="w-full h-1.5 bg-purple-500/20 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500"
                :style="{ width: (planStats?.progress || 0) + '%' }"
              />
            </div>
          </div>
          <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-3 border border-emerald-200 col-span-2 sm:col-span-4 lg:col-span-1">
            <div class="flex items-center gap-1.5 mb-1">
              <PackageX class="w-3.5 h-3.5 text-emerald-600" />
              <span class="text-[11px] text-emerald-600/80">准备进度</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold text-emerald-700 font-serif mb-1">{{ preparationPercentage }}%</div>
            <div class="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-500"
                :style="{ width: preparationPercentage + '%' }"
              />
            </div>
          </div>
          <div
            :class="[
              'rounded-lg p-3 border col-span-2 sm:col-span-2 lg:col-span-1 cursor-pointer transition-all hover:shadow-md',
              planTaskStats && planTaskStats.unresolved > 0
                ? planTaskStats.highestSeverity === 'critical'
                  ? 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-300 ring-1 ring-red-300'
                  : planTaskStats.highestSeverity === 'high'
                  ? 'bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200'
                  : 'bg-gradient-to-br from-cinnabar-50 to-cinnabar-100/50 border-cinnabar-200'
                : 'bg-gradient-to-br from-bamboo-50 to-bamboo-100/50 border-bamboo-200'
            ]"
            @click="router.push('/inspection')"
          >
            <div class="flex items-center gap-1.5 mb-1">
              <Flag class="w-3.5 h-3.5" :class="planTaskStats && planTaskStats.unresolved > 0 ? 'text-cinnabar-600' : 'text-bamboo-600'" />
              <span class="text-[11px]" :class="planTaskStats && planTaskStats.unresolved > 0 ? 'text-cinnabar-600/80' : 'text-bamboo-600/80'">未解决任务</span>
            </div>
            <div class="text-xl sm:text-2xl font-bold font-serif" :class="planTaskStats && planTaskStats.unresolved > 0 ? 'text-cinnabar-700' : 'text-bamboo-700'">
              {{ planTaskStats?.unresolved || 0 }}
            </div>
            <div v-if="planTaskStats && planTaskStats.unresolved > 0" class="text-[10px] mt-0.5" :class="planTaskStats.highestSeverity === 'critical' ? 'text-red-600' : planTaskStats.highestSeverity === 'high' ? 'text-orange-600' : 'text-cinnabar-600'">
              最高严重度：{{ planTaskStats.highestSeverity ? TASK_SEVERITY_LABELS[planTaskStats.highestSeverity] : '-' }}
            </div>
            <div v-else class="text-[10px] text-bamboo-600/70 mt-0.5">全部已解决</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div class="scroll-card p-4" :class="needPartsCount > 0 ? 'ring-1 ring-red-300' : ''">
          <div class="flex items-center gap-2 mb-3">
            <PackageX class="w-5 h-5 text-red-500" />
            <h4 class="font-bold text-ink-800">配件缺口</h4>
            <span class="tag border bg-red-50 text-red-600 border-red-200 ml-auto">
              {{ needPartsCount }}个角色
            </span>
          </div>
          <div v-if="needPartsCount === 0" class="text-sm text-ink-400 text-center py-4">
            无配件缺口
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="rc in validCharactersSorted"
              :key="rc.characterId"
            >
              <template v-if="getGapSummary(rc.character).length > 0">
                <div class="p-2 bg-red-50 rounded-md border border-red-100">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-red-800">
                      {{ rc.character.name }}
                    </span>
                    <span class="text-xs text-ink-500">#{{ rc.order }}</span>
                  </div>
                  <div class="text-xs text-red-600">
                    {{ getGapSummary(rc.character).join('，') }}
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div class="scroll-card p-4" :class="highRiskCount > 0 ? 'ring-1 ring-orange-300' : ''">
          <div class="flex items-center gap-2 mb-3">
            <AlertTriangle class="w-5 h-5 text-orange-500" />
            <h4 class="font-bold text-ink-800">风险等级汇总</h4>
            <span :class="['tag border ml-auto', riskColors[overallRisk]]">
              {{ RISK_LABELS[overallRisk] }}
            </span>
          </div>
          <div v-if="highRiskCount === 0" class="text-sm text-ink-400 text-center py-4">
            无高风险角色
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="rc in validCharactersSorted"
              :key="rc.characterId"
            >
              <template v-if="rc.character.riskLevel === 'high' || rc.character.riskLevel === 'critical'">
                <div class="p-2" :class="rc.character.riskLevel === 'critical' ? 'bg-red-50 border border-red-100 rounded-md' : 'bg-orange-50 border border-orange-100 rounded-md'">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium" :class="rc.character.riskLevel === 'critical' ? 'text-red-800' : 'text-orange-800'">
                      {{ rc.character.name }}
                    </span>
                    <span :class="['tag border text-xs', riskColors[rc.character.riskLevel]]">
                      {{ RISK_LABELS[rc.character.riskLevel] }}
                    </span>
                  </div>
                  <p v-if="rc.character.riskNote" class="text-xs line-clamp-2" :class="rc.character.riskLevel === 'critical' ? 'text-red-600' : 'text-orange-600'">
                    {{ rc.character.riskNote }}
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div class="scroll-card p-4">
          <div class="flex items-center gap-2 mb-3">
            <ClipboardCheck class="w-5 h-5" :class="handoverSummary?.color === 'red' ? 'text-red-500' : handoverSummary?.color === 'yellow' ? 'text-yellow-500' : handoverSummary?.color === 'bamboo' ? 'text-bamboo-500' : 'text-gray-500'" />
            <h4 class="font-bold text-ink-800">交接状态</h4>
            <span
              class="tag border ml-auto"
              :class="handoverSummary?.color === 'red' ? 'bg-red-50 text-red-600 border-red-200' : handoverSummary?.color === 'yellow' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : handoverSummary?.color === 'bamboo' ? 'bg-bamboo-50 text-bamboo-600 border-bamboo-200' : 'bg-gray-50 text-gray-600 border-gray-200'"
            >
              {{ handoverSummary?.label || '-' }}
            </span>
          </div>
          <div class="space-y-2">
            <div
              v-for="rc in validCharactersSorted"
              :key="rc.characterId"
            >
              <div
                :class="[
                  'p-2 rounded-md border',
                  hasObjectiveRisk(rc.character)
                    ? 'bg-red-50 border-red-100'
                    : rc.character.handoverStatus === 'follow_up'
                    ? 'bg-yellow-50 border-yellow-100'
                    : rc.character.handoverStatus === 'confirmed'
                    ? 'bg-bamboo-50 border-bamboo-100'
                    : 'bg-gray-50 border-gray-100'
                ]"
              >
                <div class="flex items-center justify-between mb-0.5">
                  <span class="text-sm font-medium text-ink-800">{{ rc.character.name }}</span>
                  <span :class="['tag border text-xs', handoverColors[rc.character.handoverStatus]]">
                    {{ HANDOVER_LABELS[rc.character.handoverStatus] }}
                  </span>
                </div>
                <p v-if="rc.character.handoverNote" class="text-xs text-ink-500 line-clamp-1">
                  {{ rc.character.handoverNote }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="scroll-card p-4" :class="unassignedOwnerCount > 0 ? 'ring-1 ring-yellow-300' : ''">
          <div class="flex items-center gap-2 mb-3">
            <FileText class="w-5 h-5 text-blue-500" />
            <h4 class="font-bold text-ink-800">待处理事项</h4>
            <span class="tag border bg-blue-50 text-blue-600 border-blue-200 ml-auto">
              {{ validCharactersSorted.filter(rc => getPendingItems(rc.character).length > 0 || !rc.character.owner).length }}项
            </span>
          </div>
          <div v-if="unassignedOwnerCount === 0 && validCharactersSorted.every(rc => getPendingItems(rc.character).length === 0 && rc.character.owner)" class="text-sm text-ink-400 text-center py-4">
            无待处理事项
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="rc in validCharactersSorted"
              :key="rc.characterId"
            >
              <template v-if="!rc.character.owner || getPendingItems(rc.character).length > 0">
                <div class="p-2 bg-blue-50 rounded-md border border-blue-100">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-blue-800">{{ rc.character.name }}</span>
                    <span v-if="!rc.character.owner" class="tag border bg-yellow-50 text-yellow-600 border-yellow-200 text-xs">
                      未分配责任人
                    </span>
                  </div>
                  <ul v-if="getPendingItems(rc.character).length > 0" class="space-y-0.5">
                    <li v-for="(item, idx) in getPendingItems(rc.character)" :key="idx" class="text-xs text-blue-600 flex items-start gap-1">
                      <ArrowRight class="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span class="line-clamp-1">{{ item }}</span>
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="scroll-card p-3 sm:p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-3">
          <h3 class="font-serif text-base sm:text-lg font-bold text-ink-800">
            排练清单
            <span class="text-sm font-normal text-ink-400 ml-2">（按出场顺序排列）</span>
          </h3>
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="flex items-center gap-1.5 text-sm text-ink-600">
              <Filter class="w-4 h-4" />
              <span class="hidden sm:inline">筛选:</span>
            </div>
            <select v-model="filterResult" class="select-base !w-auto !py-1.5 text-sm">
              <option value="">全部结果</option>
              <option v-for="(label, key) in REHEARSAL_RESULT_LABELS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
            <button
              class="btn-secondary !py-1.5 !px-2.5 text-sm"
              @click="showAddCharacter = !showAddCharacter"
            >
              <UserPlus class="w-4 h-4" />
              <span class="hidden sm:inline">添加角色</span>
              <span class="sm:hidden">添加</span>
            </button>
          </div>
        </div>

        <div
          v-if="showAddCharacter"
          class="mb-4 p-3 bg-rice-50 rounded-lg border border-rice-200 animate-slide-up"
        >
          <div class="relative mb-3">
            <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              v-model="characterSearch"
              class="input-base pl-9"
              placeholder="搜索角色名或责任人..."
            />
          </div>
          <div v-if="availableCharacters.length === 0" class="text-sm text-ink-400 text-center py-4">
            该故事所有角色都已添加到场次中
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            <button
              v-for="c in availableCharacters"
              :key="c.id"
              class="flex items-center justify-between gap-2 p-2 bg-white rounded-md border border-ink-200 hover:border-cinnabar-400 hover:bg-cinnabar-50 text-left transition-all"
              @click="addCharacter(c.id)"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium text-ink-800 truncate">{{ c.name }}</div>
                <div class="text-xs text-ink-400">{{ c.owner || '未分配' }}</div>
              </div>
              <Plus class="w-4 h-4 text-cinnabar-500 flex-shrink-0" />
            </button>
          </div>
        </div>

        <div v-if="sortedCharacters.length === 0" class="text-center py-12 text-ink-400 bg-rice-50 rounded-lg border border-rice-200 border-dashed">
          <ClipboardList class="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p class="text-sm">{{ filterResult ? '当前筛选条件下无角色' : '暂无排练角色，请点击上方「添加角色」' }}</p>
        </div>

        <div v-else class="space-y-2 sm:space-y-3">
          <div
            v-for="(rc, idx) in sortedCharacters"
            :key="rc.characterId"
            :class="[
              'scroll-card overflow-hidden transition-all',
              rc.rehearsalResult === 'fail' ? 'ring-2 ring-red-300' : '',
              rc.rehearsalResult === 'need_rehearse' ? 'ring-1 ring-orange-300' : '',
              rc.rehearsalResult === 'pass' ? 'ring-1 ring-bamboo-300' : '',
              getFullCharacter(rc.characterId) && hasObjectiveRisk(getFullCharacter(rc.characterId)!) ? 'ring-1 ring-yellow-300/50' : '',
            ]"
          >
            <div
              :class="[
                'p-3 sm:p-4 select-none',
                editingCharacterId !== rc.characterId ? 'cursor-pointer hover:bg-rice-50/80' : ''
              ]"
              @click="editingCharacterId !== rc.characterId && toggleExpand(rc.characterId)"
            >
              <div class="flex items-start gap-3">
                <div class="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                  <span
                    :class="[
                      'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold border-2',
                      rc.order <= 3
                        ? 'bg-gold-400/20 text-gold-600 border-gold-400/40'
                        : 'bg-ink-50 text-ink-600 border-ink-200'
                    ]"
                  >
                    {{ rc.order }}
                  </span>
                  <span :class="['w-2.5 h-2.5 rounded-full', rehearsalResultDotColors[rc.rehearsalResult]]" />
                  <div
                    v-if="plan.status !== 'completed' && plan.status !== 'cancelled'"
                    class="flex flex-col gap-0.5 mt-1"
                  >
                    <button
                      class="p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30 rounded hover:bg-rice-100"
                      :disabled="idx === 0"
                      @click.stop="moveOrder(rc.characterId, 'up')"
                      title="上移"
                    >
                      <ChevronUp class="w-4 h-4" />
                    </button>
                    <button
                      class="p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30 rounded hover:bg-rice-100"
                      :disabled="idx === sortedCharacters.length - 1"
                      @click.stop="moveOrder(rc.characterId, 'down')"
                      title="下移"
                    >
                      <ChevronDown class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-2 mb-1.5">
                    <h4 class="font-serif text-base sm:text-lg font-bold text-ink-800 truncate">
                      {{ getFullCharacter(rc.characterId)?.name || '未知角色' }}
                    </h4>
                    <span :class="['tag border shrink-0', rehearsalResultColors[rc.rehearsalResult]]">
                      {{ REHEARSAL_RESULT_LABELS[rc.rehearsalResult] }}
                    </span>
                    <template v-if="getFullCharacter(rc.characterId)">
                      <span
                        v-if="getFullCharacter(rc.characterId)!.riskLevel !== 'low'"
                        :class="['tag border shrink-0 flex items-center gap-1', riskColors[getFullCharacter(rc.characterId)!.riskLevel]]"
                      >
                        <component :is="riskIconMap[getFullCharacter(rc.characterId)!.riskLevel]" class="w-3 h-3" />
                        {{ RISK_LABELS[getFullCharacter(rc.characterId)!.riskLevel] }}
                      </span>
                      <span
                        v-if="getGapSummary(getFullCharacter(rc.characterId)!).length > 0"
                        class="tag border bg-red-50 text-red-600 border-red-200 shrink-0"
                      >
                        <PackageX class="w-3 h-3 mr-1" />
                        {{ getGapSummary(getFullCharacter(rc.characterId)!).length }}项缺件
                      </span>
                      <span
                        v-if="!getFullCharacter(rc.characterId)!.owner"
                        class="tag border bg-yellow-50 text-yellow-600 border-yellow-200 shrink-0"
                      >
                        <User class="w-3 h-3 mr-1" />
                        未分配
                      </span>
                      <span
                        v-if="getUnresolvedCharacterTasks(rc.characterId).length > 0"
                        class="tag border shrink-0 flex items-center gap-1 bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200 cursor-pointer hover:bg-cinnabar-100"
                        @click.stop="toggleExpand(rc.characterId)"
                      >
                        <Flag class="w-3 h-3" />
                        {{ getUnresolvedCharacterTasks(rc.characterId).length }} 个巡检任务
                      </span>
                    </template>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-2">
                    <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                      <User class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                      <span v-if="getFullCharacter(rc.characterId)?.owner" class="text-ink-700 truncate">
                        {{ getFullCharacter(rc.characterId)!.owner }}
                      </span>
                      <span v-else class="text-red-500 font-medium">未指定责任人</span>
                    </div>
                    <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                      <CheckCircle v-if="rc.checkedBy" class="w-3.5 h-3.5 text-bamboo-500 flex-shrink-0" />
                      <AlertCircle v-else class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                      <span v-if="rc.checkedBy" class="text-ink-700">{{ rc.checkedBy }} 已核对</span>
                      <span v-else class="text-ink-400">未确认核对人</span>
                    </div>
                    <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                      <ClipboardCheck class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                      <span class="text-ink-700 truncate">
                        {{ getFullCharacter(rc.characterId) ? STATUS_LABELS[getFullCharacter(rc.characterId)!.status] : '-' }}
                      </span>
                    </div>
                  </div>

                  <div v-if="rc.rehearsalNote" class="text-xs sm:text-sm text-ink-600 bg-rice-50 p-2 rounded-md border border-rice-100 mb-2">
                    <span class="font-medium text-ink-700">排练备注：</span>{{ rc.rehearsalNote }}
                  </div>

                  <div v-if="expandedIds.has(rc.characterId) && getFullCharacter(rc.characterId)" class="mt-3 space-y-2 animate-fade-in">
                    <div
                      v-for="(gap, gi) in getGapSummary(getFullCharacter(rc.characterId)!)"
                      :key="'g' + gi"
                      class="flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm bg-red-50 border border-red-200 text-red-700"
                    >
                      <PackageX class="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>配件缺口：{{ gap }}</span>
                    </div>
                    <div
                      v-if="getFullCharacter(rc.characterId)!.riskNote && getFullCharacter(rc.characterId)!.riskLevel !== 'low'"
                      class="flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm"
                      :class="getFullCharacter(rc.characterId)!.riskLevel === 'critical' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-orange-50 border border-orange-200 text-orange-700'"
                    >
                      <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>风险提示：{{ getFullCharacter(rc.characterId)!.riskNote }}</span>
                    </div>
                    <div
                      v-if="getFullCharacter(rc.characterId)!.repairNote"
                      class="flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm bg-yellow-50 border border-yellow-200 text-yellow-700"
                    >
                      <Wrench class="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>修补备注：{{ getFullCharacter(rc.characterId)!.repairNote }}</span>
                    </div>
                    <div
                      v-for="(rem, ri) in getFullCharacter(rc.characterId)!.operationReminders"
                      :key="'r' + ri"
                      class="flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm bg-blue-50 border border-blue-200 text-blue-700"
                    >
                      <AlertCircle class="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>操作提醒：{{ rem }}</span>
                    </div>
                    <div
                      v-if="getFullCharacter(rc.characterId)!.handoverNote"
                      class="flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm bg-purple-50 border border-purple-200 text-purple-700"
                    >
                      <ClipboardCheck class="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>交接备注：{{ getFullCharacter(rc.characterId)!.handoverNote }}</span>
                    </div>

                    <div class="pt-2 border-t border-rice-100 space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                          <Flag class="w-3.5 h-3.5 text-cinnabar-600" />
                          关联巡检任务
                          <span
                            v-if="getUnresolvedCharacterTasks(rc.characterId).length > 0"
                            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cinnabar-100 text-cinnabar-700 text-[10px] font-bold"
                          >
                            {{ getUnresolvedCharacterTasks(rc.characterId).length }} 待处理
                          </span>
                        </div>
                        <button
                          v-if="showQuickTaskFor !== rc.characterId"
                          class="inline-flex items-center gap-1 text-xs text-cinnabar-700 hover:text-cinnabar-800 font-medium"
                          @click.stop="openQuickTask(rc.characterId)"
                        >
                          <Plus class="w-3 h-3" />
                          新建任务
                        </button>
                      </div>

                      <div v-if="showQuickTaskFor === rc.characterId" class="p-2.5 rounded-md bg-cinnabar-50/50 border border-cinnabar-200 space-y-2">
                        <input
                          v-model="quickTaskTitle"
                          type="text"
                          placeholder="任务标题"
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
                            <button class="px-2.5 py-1 text-xs bg-cinnabar-700 text-white rounded hover:bg-cinnabar-800" @click.stop="submitQuickTask(rc.characterId)">创建</button>
                          </div>
                        </div>
                      </div>

                      <div v-if="getCharacterTasks(rc.characterId).length > 0" class="space-y-1.5">
                        <div
                          v-for="task in getCharacterTasks(rc.characterId)"
                          :key="task.id"
                          :class="[
                            'p-2 rounded-md border text-xs',
                            task.status === 'blocked'
                              ? 'bg-red-50/60 border-red-200'
                              : task.status === 'resolved'
                              ? 'bg-green-50/60 border-green-200 opacity-70'
                              : task.status === 'dismissed'
                              ? 'bg-gray-50 border-gray-200 opacity-60'
                              : task.sourceType === 'rehearsal'
                              ? 'bg-cinnabar-50/40 border-cinnabar-200'
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
                              </div>
                              <div
                                class="font-medium text-ink-800 leading-snug"
                                :class="{ 'line-through text-ink-400': task.status === 'resolved' || task.status === 'dismissed' }"
                              >
                                {{ task.title }}
                              </div>
                              <div v-if="task.description" class="text-ink-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{{ task.description }}</div>
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
                      <div v-else-if="showQuickTaskFor !== rc.characterId" class="text-xs text-ink-400 italic">
                        该角色暂无关联巡检任务
                      </div>
                    </div>

                    <div v-if="editingCharacterId !== rc.characterId && plan.status !== 'completed' && plan.status !== 'cancelled'" class="flex flex-wrap gap-2 pt-2 border-t border-rice-100">
                      <button
                        class="btn-secondary !py-1 !px-2.5 text-xs"
                        @click.stop="startEditCharacter(rc)"
                      >
                        <Edit3 class="w-3.5 h-3.5" />
                        更新排练结果
                      </button>
                      <button
                        v-if="rc.rehearsalResult !== 'pass'"
                        class="btn-secondary !py-1 !px-2.5 text-xs !bg-bamboo-50 !text-bamboo-700 !border-bamboo-200 hover:!bg-bamboo-100"
                        @click.stop="quickSetResult(rc, 'pass')"
                      >
                        <Check class="w-3.5 h-3.5" />
                        → 通过
                      </button>
                      <button
                        v-if="rc.rehearsalResult !== 'need_rehearse'"
                        class="btn-secondary !py-1 !px-2.5 text-xs !bg-orange-50 !text-orange-700 !border-orange-200 hover:!bg-orange-100"
                        @click.stop="quickSetResult(rc, 'need_rehearse')"
                      >
                        <Clock class="w-3.5 h-3.5" />
                        → 需复排
                      </button>
                      <button
                        v-if="rc.rehearsalResult !== 'fail'"
                        class="btn-secondary !py-1 !px-2.5 text-xs !bg-red-50 !text-red-700 !border-red-200 hover:!bg-red-100"
                        @click.stop="quickSetResult(rc, 'fail')"
                      >
                        <X class="w-3.5 h-3.5" />
                        → 未通过
                      </button>
                      <button
                        class="btn-danger !py-1 !px-2.5 text-xs ml-auto"
                        @click.stop="removeCharacter(rc.characterId)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                        移除
                      </button>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1 ml-2">
                  <button
                    v-if="editingCharacterId !== rc.characterId"
                    class="p-1 rounded hover:bg-rice-200 text-ink-400 transition-colors"
                  >
                    <ChevronRight
                      class="w-5 h-5"
                      :class="expandedIds.has(rc.characterId) ? 'rotate-90' : ''"
                      style="transition: transform 0.2s;"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="editingCharacterId === rc.characterId"
              class="px-3 sm:px-4 pb-4 border-t border-rice-200 bg-rice-50/50 animate-slide-up"
            >
              <div class="pt-4 space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="label-base">排练结果</label>
                    <select v-model="editResultForm.result" class="select-base">
                      <option v-for="(label, key) in REHEARSAL_RESULT_LABELS" :key="key" :value="key">
                        {{ label }}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label class="label-base">核对人</label>
                    <input v-model="editResultForm.checkedBy" class="input-base" placeholder="请输入核对人姓名" />
                  </div>
                </div>
                <div>
                  <label class="label-base">排练备注</label>
                  <textarea
                    v-model="editResultForm.note"
                    class="input-base resize-none"
                    rows="3"
                    placeholder="记录排练情况、问题、改进建议等..."
                  />
                </div>
                <div class="flex flex-wrap gap-2 justify-end">
                  <button class="btn-secondary !py-1.5" @click="cancelEdit">
                    <X class="w-4 h-4" />
                    取消
                  </button>
                  <button class="btn-primary !py-1.5" @click="saveEdit">
                    <Save class="w-4 h-4" />
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="(plan.problemNotes || plan.summaryNote)" class="scroll-card p-4 sm:p-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div v-if="plan.problemNotes">
            <div class="flex items-center gap-2 mb-2">
              <AlertTriangle class="w-5 h-5 text-orange-500" />
              <h4 class="font-bold text-ink-800">排练问题记录</h4>
            </div>
            <div class="p-3 bg-orange-50 rounded-lg border border-orange-100 text-sm text-orange-800 whitespace-pre-wrap">
              {{ plan.problemNotes }}
            </div>
          </div>
          <div v-if="plan.summaryNote">
            <div class="flex items-center gap-2 mb-2">
              <FileText class="w-5 h-5 text-blue-500" />
              <h4 class="font-bold text-ink-800">场次总结 / 备注</h4>
            </div>
            <div class="p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800 whitespace-pre-wrap">
              {{ plan.summaryNote }}
            </div>
          </div>
        </div>
      </div>
    </main>

    <main v-else class="flex-1 max-w-[1600px] w-full mx-auto px-4 py-8">
      <div class="scroll-card p-12 text-center text-ink-400">
        <AlertCircle class="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>找不到该排练场次</p>
        <button class="btn-primary mt-4" @click="router.push('/rehearsal')">
          返回列表
        </button>
      </div>
    </main>

    <RehearsalPlanModal
      :visible="showModal"
      :edit-plan="plan || null"
      @close="showModal = false"
      @saved="handlePlanSaved"
    />

    <ToastContainer />
  </div>
</template>
