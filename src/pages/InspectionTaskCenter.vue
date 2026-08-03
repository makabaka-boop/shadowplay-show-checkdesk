<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Plus,
  Search,
  Filter,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  Play,
  Edit3,
  Trash2,
  Save,
  X,
  ExternalLink,
  Users,
  ClipboardList,
  ClipboardCheck,
  Theater,
  UserPlus,
  PackageX,
  ShieldAlert,
  ListChecks,
  RefreshCw,
  Calendar,
  User,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import type {
  InspectionTask,
  InspectionSourceType,
  InspectionSeverity,
  InspectionTaskStatus,
} from '../types';
import {
  INSPECTION_SOURCE_LABELS,
  INSPECTION_SEVERITY_LABELS,
  INSPECTION_STATUS_LABELS,
} from '../types';

const router = useRouter();
const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  resolveTask,
  syncTasksFromCharacters,
  allStories,
  allAssignees,
  openTaskCount,
  criticalTaskCount,
} = useInspectionTasks();
const { characters, allStories: characterStories } = useCharacters();
const { success, warning, error } = useToast();

const filterStory = ref<string>('');
const filterAssignee = ref<string>('');
const filterStatus = ref<InspectionTaskStatus | ''>('');
const filterSeverity = ref<InspectionSeverity | ''>('');
const searchKeyword = ref('');

const showModal = ref(false);
const editingTask = ref<InspectionTask | null>(null);

const formData = ref({
  title: '',
  description: '',
  story: '',
  characterId: '',
  severity: 'medium' as InspectionSeverity,
  status: 'open' as InspectionTaskStatus,
  assignee: '',
  dueAt: '',
  sourceType: 'manual' as InspectionSourceType,
});

onMounted(() => {
  const result = syncTasksFromCharacters();
  if (result.created > 0) {
    success(`自动同步发现 ${result.created} 个新巡检任务`);
  }
});

const storyOptions = computed(() => {
  const set = new Set<string>();
  allStories.value.forEach(s => set.add(s));
  characterStories.value.forEach(s => set.add(s));
  return Array.from(set).sort();
});

const filteredTasks = computed(() => {
  let result = [...tasks.value];

  if (filterStory.value) {
    result = result.filter(t => t.story === filterStory.value);
  }
  if (filterAssignee.value) {
    if (filterAssignee.value === '__unassigned__') {
      result = result.filter(t => !t.assignee);
    } else {
      result = result.filter(t => t.assignee === filterAssignee.value);
    }
  }
  if (filterStatus.value) {
    result = result.filter(t => t.status === filterStatus.value);
  }
  if (filterSeverity.value) {
    result = result.filter(t => t.severity === filterSeverity.value);
  }
  if (searchKeyword.value.trim()) {
    const q = searchKeyword.value.trim().toLowerCase();
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.assignee.toLowerCase().includes(q)
    );
  }

  const statusOrder: Record<InspectionTaskStatus, number> = {
    blocked: 0,
    open: 1,
    in_progress: 2,
    resolved: 3,
    dismissed: 4,
  };
  const severityOrder: Record<InspectionSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  result.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return result;
});

const stats = computed(() => {
  const total = tasks.value.length;
  const open = tasks.value.filter(t => t.status === 'open').length;
  const inProgress = tasks.value.filter(t => t.status === 'in_progress').length;
  const blocked = tasks.value.filter(t => t.status === 'blocked').length;
  const resolved = tasks.value.filter(t => t.status === 'resolved').length;
  const dismissed = tasks.value.filter(t => t.status === 'dismissed').length;
  return { total, open, inProgress, blocked, resolved, dismissed };
});

function getCharacterName(charId: string): string {
  if (!charId) return '';
  const char = characters.value.find(c => c.id === charId);
  return char?.name || '';
}

function getSourceUrl(task: InspectionTask): string | null {
  if (task.sourceType === 'character' || task.sourceType === 'handover') {
    if (task.sourceType === 'handover') return '/handover';
    return '/';
  }
  if (task.sourceType === 'rehearsal' && task.planId) {
    return `/rehearsal/${task.planId}`;
  }
  return null;
}

function getSourceIcon(sourceType: InspectionSourceType) {
  switch (sourceType) {
    case 'character': return Users;
    case 'handover': return ClipboardCheck;
    case 'rehearsal': return Theater;
    case 'manual': return ClipboardList;
  }
}

function getSourceColor(sourceType: InspectionSourceType): string {
  switch (sourceType) {
    case 'character': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'handover': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'rehearsal': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'manual': return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

const severityStyles: Record<InspectionSeverity, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const severityDotStyles: Record<InspectionSeverity, string> = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const statusStyles: Record<InspectionTaskStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  resolved: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  dismissed: 'bg-gray-50 text-gray-500 border-gray-200',
};

function getStatusIcon(status: InspectionTaskStatus) {
  switch (status) {
    case 'open': return Clock;
    case 'in_progress': return Play;
    case 'blocked': return Pause;
    case 'resolved': return CheckCircle;
    case 'dismissed': return XCircle;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function isOverdue(task: InspectionTask): boolean {
  if (!task.dueAt) return false;
  if (task.status === 'resolved' || task.status === 'dismissed') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

function openCreate() {
  editingTask.value = null;
  formData.value = {
    title: '',
    description: '',
    story: storyOptions.value[0] || '',
    characterId: '',
    severity: 'medium',
    status: 'open',
    assignee: '',
    dueAt: '',
    sourceType: 'manual',
  };
  showModal.value = true;
}

function openEdit(task: InspectionTask) {
  editingTask.value = task;
  formData.value = {
    title: task.title,
    description: task.description,
    story: task.story,
    characterId: task.characterId,
    severity: task.severity,
    status: task.status,
    assignee: task.assignee,
    dueAt: task.dueAt ? task.dueAt.slice(0, 16) : '',
    sourceType: task.sourceType,
  };
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingTask.value = null;
}

function handleSave() {
  if (!formData.value.title.trim()) {
    warning('请填写任务标题');
    return;
  }

  if (editingTask.value) {
    updateTask(editingTask.value.id, {
      title: formData.value.title.trim(),
      description: formData.value.description.trim(),
      story: formData.value.story,
      characterId: formData.value.characterId,
      severity: formData.value.severity,
      status: formData.value.status,
      assignee: formData.value.assignee.trim(),
      dueAt: formData.value.dueAt,
    });
    success('任务已更新');
  } else {
    addTask({
      sourceType: formData.value.sourceType,
      sourceId: `manual:${Date.now()}`,
      title: formData.value.title.trim(),
      description: formData.value.description.trim(),
      story: formData.value.story,
      characterId: formData.value.characterId,
      planId: '',
      severity: formData.value.severity,
      status: formData.value.status,
      assignee: formData.value.assignee.trim(),
      dueAt: formData.value.dueAt,
      resolvedAt: '',
    });
    success('任务已创建');
  }
  closeModal();
}

function handleResolve(task: InspectionTask) {
  resolveTask(task.id);
  success(`任务「${task.title}」已标记为解决`);
}

function handleDelete(task: InspectionTask) {
  if (confirm(`确定删除任务「${task.title}」吗？`)) {
    deleteTask(task.id);
    success('任务已删除');
  }
}

function quickSetStatus(task: InspectionTask, status: InspectionTaskStatus) {
  updateTask(task.id, { status });
}

function handleSync() {
  const result = syncTasksFromCharacters();
  if (result.created > 0 || result.unblocked > 0 || result.blocked > 0) {
    const parts: string[] = [];
    if (result.created > 0) parts.push(`新建 ${result.created} 个`);
    if (result.unblocked > 0) parts.push(`解除阻塞 ${result.unblocked} 个`);
    if (result.blocked > 0) parts.push(`自动阻塞 ${result.blocked} 个`);
    success(`同步完成：${parts.join('，')}`);
  } else {
    warning('同步完成：没有发现新的巡检任务');
  }
}

function resetFilters() {
  filterStory.value = '';
  filterAssignee.value = '';
  filterStatus.value = '';
  filterSeverity.value = '';
  searchKeyword.value = '';
}

const hasActiveFilters = computed(() =>
  filterStory.value || filterAssignee.value || filterStatus.value || filterSeverity.value || searchKeyword.value
);

const storyCharacters = computed(() => {
  if (!formData.value.story) return [];
  return characters.value.filter(c => c.story === formData.value.story);
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800">巡检任务中心</h2>
          <span class="tag border bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200">
            <ShieldAlert class="w-3 h-3 mr-1" />
            风险追踪
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary !py-1.5" @click="handleSync">
            <RefreshCw class="w-4 h-4" />
            <span class="hidden sm:inline">同步风险项</span>
          </button>
          <button class="btn-primary !py-1.5" @click="openCreate">
            <Plus class="w-4 h-4" />
            <span class="hidden sm:inline">新建任务</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 sm:p-4 border border-blue-200">
          <div class="flex items-center gap-2 mb-1">
            <ListChecks class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <span class="text-xs text-blue-600/80">全部任务</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-blue-700 font-serif">{{ stats.total }}</div>
        </div>
        <div class="bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-lg p-3 sm:p-4 border border-yellow-200">
          <div class="flex items-center gap-2 mb-1">
            <Clock class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
            <span class="text-xs text-yellow-600/80">待处理</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-yellow-700 font-serif">{{ stats.open }}</div>
        </div>
        <div class="bg-gradient-to-br from-cinnabar-50 to-cinnabar-100/50 rounded-lg p-3 sm:p-4 border border-cinnabar-200">
          <div class="flex items-center gap-2 mb-1">
            <Play class="w-4 h-4 sm:w-5 sm:h-5 text-cinnabar-600" />
            <span class="text-xs text-cinnabar-600/80">处理中</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-cinnabar-700 font-serif">{{ stats.inProgress }}</div>
        </div>
        <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3 sm:p-4 border border-red-200">
          <div class="flex items-center gap-2 mb-1">
            <Pause class="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            <span class="text-xs text-red-600/80">已阻塞</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-red-700 font-serif">{{ stats.blocked }}</div>
        </div>
        <div class="bg-gradient-to-br from-bamboo-50 to-emerald-100/50 rounded-lg p-3 sm:p-4 border border-bamboo-200">
          <div class="flex items-center gap-2 mb-1">
            <CheckCircle class="w-4 h-4 sm:w-5 sm:h-5 text-bamboo-600" />
            <span class="text-xs text-bamboo-600/80">已解决</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-bamboo-700 font-serif">{{ stats.resolved }}</div>
        </div>
        <div class="bg-gradient-to-br from-red-50 to-orange-100/50 rounded-lg p-3 sm:p-4 border border-red-300 col-span-2 sm:col-span-1">
          <div class="flex items-center gap-2 mb-1">
            <AlertOctagon class="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            <span class="text-xs text-red-600/80">紧急任务</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-red-700 font-serif">{{ criticalTaskCount }}</div>
        </div>
      </div>

      <div class="scroll-card p-4">
        <div class="flex flex-col lg:flex-row lg:items-center gap-3">
          <div class="flex items-center gap-2 text-sm text-ink-600">
            <Filter class="w-4 h-4" />
            <span class="font-medium">筛选</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <select v-model="filterStory" class="select-base !py-1.5 !w-auto text-sm min-w-[120px]">
              <option value="">全部故事</option>
              <option v-for="story in storyOptions" :key="story" :value="story">{{ story }}</option>
            </select>
            <select v-model="filterAssignee" class="select-base !py-1.5 !w-auto text-sm min-w-[120px]">
              <option value="">全部负责人</option>
              <option v-for="assignee in allAssignees" :key="assignee" :value="assignee">{{ assignee }}</option>
              <option value="__unassigned__">未分配</option>
            </select>
            <select v-model="filterStatus" class="select-base !py-1.5 !w-auto text-sm min-w-[110px]">
              <option value="">全部状态</option>
              <option v-for="(label, key) in INSPECTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
            <select v-model="filterSeverity" class="select-base !py-1.5 !w-auto text-sm min-w-[110px]">
              <option value="">全部严重度</option>
              <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
            <div class="relative flex-1 min-w-[180px] max-w-xs">
              <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                v-model="searchKeyword"
                type="text"
                class="input-base !py-1.5 pl-9 text-sm"
                placeholder="搜索任务标题、描述、负责人..."
              />
            </div>
            <button
              v-if="hasActiveFilters"
              class="btn-secondary !py-1.5 text-sm"
              @click="resetFilters"
            >
              <X class="w-3.5 h-3.5" />
              清除
            </button>
          </div>
        </div>
      </div>

      <div v-if="filteredTasks.length === 0" class="scroll-card p-12 text-center text-ink-400">
        <ListChecks class="w-12 h-12 mx-auto mb-3 text-ink-300" />
        <p class="text-sm">暂无符合条件的巡检任务</p>
        <button class="btn-secondary !py-1.5 mt-4 text-sm" @click="openCreate">
          <Plus class="w-4 h-4" />
          创建第一个任务
        </button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          :class="[
            'scroll-card p-4 transition-all hover:shadow-md',
            task.status === 'blocked' ? 'ring-2 ring-red-300' : '',
            task.status === 'resolved' || task.status === 'dismissed' ? 'opacity-70' : '',
            isOverdue(task) ? 'ring-1 ring-red-200' : '',
          ]"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="['tag border shrink-0', getSourceColor(task.sourceType)]">
                <component :is="getSourceIcon(task.sourceType)" class="w-3 h-3 mr-1" />
                {{ INSPECTION_SOURCE_LABELS[task.sourceType] }}
              </span>
              <span :class="['tag border shrink-0', severityStyles[task.severity]]">
                <span :class="['w-1.5 h-1.5 rounded-full mr-1', severityDotStyles[task.severity]]" />
                {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
              </span>
            </div>
            <span :class="['tag border shrink-0', statusStyles[task.status]]">
              <component :is="getStatusIcon(task.status)" class="w-3 h-3 mr-1" />
              {{ INSPECTION_STATUS_LABELS[task.status] }}
            </span>
          </div>

          <h4 class="font-serif text-base font-bold text-ink-800 mb-1.5 leading-snug">{{ task.title }}</h4>
          <p v-if="task.description" class="text-sm text-ink-600 line-clamp-2 mb-3">{{ task.description }}</p>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 mb-3">
            <span v-if="task.story" class="flex items-center gap-1">
              <ClipboardList class="w-3 h-3" />
              {{ task.story }}
            </span>
            <span v-if="getCharacterName(task.characterId)" class="flex items-center gap-1">
              <Users class="w-3 h-3" />
              {{ getCharacterName(task.characterId) }}
            </span>
            <span v-if="task.assignee" class="flex items-center gap-1">
              <User class="w-3 h-3" />
              {{ task.assignee }}
            </span>
            <span v-else class="flex items-center gap-1 text-yellow-600">
              <UserPlus class="w-3 h-3" />
              未分配
            </span>
            <span v-if="task.dueAt" :class="['flex items-center gap-1', isOverdue(task) ? 'text-red-600 font-medium' : '']">
              <Calendar class="w-3 h-3" />
              {{ formatDate(task.dueAt) }}
              <span v-if="isOverdue(task)">（已逾期）</span>
            </span>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-rice-200">
            <a
              v-if="getSourceUrl(task)"
              :href="getSourceUrl(task)!"
              class="inline-flex items-center gap-1 text-xs text-cinnabar-600 hover:text-cinnabar-800 transition-colors"
              @click.prevent="router.push(getSourceUrl(task)!)"
            >
              <ExternalLink class="w-3 h-3" />
              查看来源
            </a>
            <span v-else class="text-xs text-ink-300">无来源链接</span>

            <div class="flex items-center gap-1">
              <button
                v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                class="p-1.5 rounded hover:bg-bamboo-100 text-bamboo-600 transition-colors"
                title="标记为已解决"
                @click="handleResolve(task)"
              >
                <CheckCircle class="w-4 h-4" />
              </button>
              <button
                v-if="task.status !== 'in_progress' && task.status !== 'resolved' && task.status !== 'dismissed'"
                class="p-1.5 rounded hover:bg-cinnabar-100 text-cinnabar-600 transition-colors"
                title="开始处理"
                @click="quickSetStatus(task, 'in_progress')"
              >
                <Play class="w-4 h-4" />
              </button>
              <button
                class="p-1.5 rounded hover:bg-rice-200 text-ink-500 transition-colors"
                title="编辑"
                @click="openEdit(task)"
              >
                <Edit3 class="w-4 h-4" />
              </button>
              <button
                class="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                title="删除"
                @click="handleDelete(task)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal-content max-w-xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-rice-200 bg-gradient-to-r from-rice-100 to-rice-50">
          <h3 class="font-serif text-lg font-bold text-ink-800">
            {{ editingTask ? '编辑巡检任务' : '新建巡检任务' }}
          </h3>
          <button class="p-1 rounded hover:bg-rice-200 text-ink-500" @click="closeModal">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="label-base">任务标题 <span class="text-red-500">*</span></label>
            <input v-model="formData.title" type="text" class="input-base" placeholder="输入任务标题" />
          </div>

          <div>
            <label class="label-base">任务描述</label>
            <textarea
              v-model="formData.description"
              class="input-base resize-none"
              rows="3"
              placeholder="详细描述任务内容、风险点、处理要求..."
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">所属故事</label>
              <select v-model="formData.story" class="select-base">
                <option value="">未分类</option>
                <option v-for="story in storyOptions" :key="story" :value="story">{{ story }}</option>
              </select>
            </div>
            <div>
              <label class="label-base">关联角色</label>
              <select v-model="formData.characterId" class="select-base">
                <option value="">不关联</option>
                <option v-for="char in storyCharacters" :key="char.id" :value="char.id">{{ char.name }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">严重程度</label>
              <select v-model="formData.severity" class="select-base">
                <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div>
              <label class="label-base">任务状态</label>
              <select v-model="formData.status" class="select-base">
                <option v-for="(label, key) in INSPECTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">负责人</label>
              <input v-model="formData.assignee" type="text" class="input-base" placeholder="输入负责人姓名" />
            </div>
            <div>
              <label class="label-base">截止时间</label>
              <input v-model="formData.dueAt" type="datetime-local" class="input-base" />
            </div>
          </div>

          <div v-if="editingTask">
            <label class="label-base">来源类型</label>
            <div :class="['tag border', getSourceColor(editingTask.sourceType)]">
              <component :is="getSourceIcon(editingTask.sourceType)" class="w-3 h-3 mr-1" />
              {{ INSPECTION_SOURCE_LABELS[editingTask.sourceType] }}
            </div>
            <p class="text-xs text-ink-400 mt-1">来源类型不可修改</p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-rice-200 bg-rice-50/50">
          <button class="btn-secondary !py-1.5" @click="closeModal">
            <X class="w-4 h-4" />
            取消
          </button>
          <button class="btn-primary !py-1.5" @click="handleSave">
            <Save class="w-4 h-4" />
            {{ editingTask ? '保存修改' : '创建任务' }}
          </button>
        </div>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
