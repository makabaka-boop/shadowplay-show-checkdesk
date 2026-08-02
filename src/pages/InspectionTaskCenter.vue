<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ListTodo,
  Plus,
  Filter,
  ExternalLink,
  User,
  Calendar,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Clock,
  Ban,
  XCircle,
  Trash2,
  Edit3,
  Save,
  X,
  RefreshCw,
  Link2,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import type {
  InspectionTask,
  InspectionSeverity,
  InspectionStatus,
  InspectionSourceType,
} from '../types';
import {
  INSPECTION_SOURCE_LABELS,
  INSPECTION_SEVERITY_LABELS,
  INSPECTION_STATUS_LABELS,
} from '../types';

const route = useRoute();
const router = useRouter();
const { tasks, addTask, updateTask, deleteTask, resolveTask, syncTasksFromCharacters } = useInspectionTasks();
const { characters, allStories } = useCharacters();
const { success, warning } = useToast();

const filterStory = ref((route.query.story as string) || '');
const filterAssignee = ref('');
const filterStatus = ref<InspectionStatus | ''>('');
const filterSeverity = ref<InspectionSeverity | ''>('');
const filterSourceType = ref<InspectionSourceType | ''>('');
const filterCharacterId = ref((route.query.characterId as string) || '');
const filterPlanId = ref((route.query.planId as string) || '');

const allAssignees = computed(() => {
  const set = new Set(tasks.value.map(t => t.assignee).filter(Boolean));
  return Array.from(set).sort();
});

const statusOrder: Record<InspectionStatus, number> = {
  open: 0,
  in_progress: 1,
  blocked: 2,
  resolved: 3,
  dismissed: 4,
};
const severityOrder: Record<InspectionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const filteredTasks = computed(() => {
  let list = [...tasks.value];
  if (filterStory.value) list = list.filter(t => t.story === filterStory.value);
  if (filterAssignee.value) {
    list = list.filter(t =>
      filterAssignee.value === '__unassigned__' ? !t.assignee : t.assignee === filterAssignee.value
    );
  }
  if (filterStatus.value) list = list.filter(t => t.status === filterStatus.value);
  if (filterSeverity.value) list = list.filter(t => t.severity === filterSeverity.value);
  if (filterSourceType.value) list = list.filter(t => t.sourceType === filterSourceType.value);
  if (filterCharacterId.value) list = list.filter(t => t.characterId === filterCharacterId.value);
  if (filterPlanId.value) list = list.filter(t => t.planId === filterPlanId.value);
  return list.sort((a, b) => {
    const s = statusOrder[a.status] - statusOrder[b.status];
    if (s !== 0) return s;
    const sev = severityOrder[a.severity] - severityOrder[b.severity];
    if (sev !== 0) return sev;
    return (a.dueAt || '9999').localeCompare(b.dueAt || '9999');
  });
});

const statusStats = computed(() => ({
  open: tasks.value.filter(t => t.status === 'open').length,
  in_progress: tasks.value.filter(t => t.status === 'in_progress').length,
  blocked: tasks.value.filter(t => t.status === 'blocked').length,
  resolved: tasks.value.filter(t => t.status === 'resolved').length,
}));

const severityColors: Record<InspectionSeverity, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const statusColors: Record<InspectionStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  resolved: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  dismissed: 'bg-gray-50 text-gray-500 border-gray-200',
};

const statusIconMap: Record<InspectionStatus, any> = {
  open: AlertTriangle,
  in_progress: Clock,
  blocked: Ban,
  resolved: CheckCircle,
  dismissed: XCircle,
};

function formatDate(v: string): string {
  if (!v) return '未设置';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isOverdue(task: InspectionTask): boolean {
  if (!task.dueAt) return false;
  if (task.status === 'resolved' || task.status === 'dismissed') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

function characterName(characterId: string): string {
  return characters.value.find(c => c.id === characterId)?.name || '已删除角色';
}

function goToSource(task: InspectionTask) {
  if (task.sourceType === 'character') {
    router.push('/');
  } else if (task.sourceType === 'handover') {
    router.push('/handover');
  } else if (task.sourceType === 'rehearsal') {
    router.push(task.planId ? `/rehearsal/${task.planId}` : '/rehearsal');
  }
}

function handleSync() {
  const result = syncTasksFromCharacters();
  if (result.created === 0 && result.blocked === 0) {
    success('同步完成，暂无新增或阻塞任务');
  } else {
    success(`同步完成：新增 ${result.created} 条任务，${result.blocked} 条任务进入阻塞`);
  }
}

function handleResolve(task: InspectionTask) {
  resolveTask(task.id);
  success(`任务「${task.title}」已标记为解决`);
}

function handleDelete(task: InspectionTask) {
  deleteTask(task.id);
  success(`任务「${task.title}」已删除`);
}

function quickStatus(task: InspectionTask, status: InspectionStatus) {
  updateTask(task.id, { status });
  success(`任务「${task.title}」已更新为「${INSPECTION_STATUS_LABELS[status]}」`);
}

// ------- 新建 / 编辑弹窗 -------
const showModal = ref(false);
const editingTaskId = ref<string | null>(null);
const form = reactive({
  title: '',
  story: '',
  characterId: '',
  severity: 'medium' as InspectionSeverity,
  status: 'open' as InspectionStatus,
  assignee: '',
  dueAt: '',
  description: '',
});

function toLocalInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openCreate() {
  editingTaskId.value = null;
  form.title = '';
  form.story = filterStory.value || allStories.value[0] || '';
  form.characterId = '';
  form.severity = 'medium';
  form.status = 'open';
  form.assignee = '';
  form.dueAt = '';
  form.description = '';
  showModal.value = true;
}

function openEdit(task: InspectionTask) {
  editingTaskId.value = task.id;
  form.title = task.title;
  form.story = task.story;
  form.characterId = task.characterId;
  form.severity = task.severity;
  form.status = task.status;
  form.assignee = task.assignee;
  form.dueAt = toLocalInput(task.dueAt);
  form.description = task.description;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingTaskId.value = null;
}

function onPickCharacter() {
  if (!form.characterId) return;
  const char = characters.value.find(c => c.id === form.characterId);
  if (char) {
    form.story = char.story;
    if (!form.assignee) form.assignee = char.owner;
  }
}

function saveModal() {
  if (!form.title.trim()) {
    warning('请填写任务标题');
    return;
  }
  if (editingTaskId.value) {
    updateTask(editingTaskId.value, {
      title: form.title.trim(),
      story: form.story.trim() || '未分类',
      characterId: form.characterId,
      severity: form.severity,
      status: form.status,
      assignee: form.assignee.trim(),
      dueAt: form.dueAt,
      description: form.description.trim(),
    });
    success('任务已更新');
  } else {
    addTask({
      sourceType: 'manual',
      sourceId: '',
      story: form.story.trim() || '未分类',
      characterId: form.characterId,
      planId: '',
      title: form.title.trim(),
      description: form.description.trim(),
      severity: form.severity,
      status: 'open',
      assignee: form.assignee.trim(),
      dueAt: form.dueAt,
      resolvedAt: '',
    });
    success('已创建巡检任务');
  }
  closeModal();
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800">巡检任务中心</h2>
          <span class="tag border bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200">
            <ListTodo class="w-3 h-3 mr-1" />
            风险项统一追踪
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary !py-1.5" @click="handleSync">
            <RefreshCw class="w-4 h-4" />
            同步风险项
          </button>
          <button class="btn-primary !py-1.5" @click="openCreate">
            <Plus class="w-4 h-4" />
            新建任务
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <button
          v-for="(label, key) in {
            open: '待处理',
            in_progress: '处理中',
            blocked: '已阻塞',
            resolved: '已解决',
          }"
          :key="key"
          :class="[
            'scroll-card p-3 sm:p-4 text-left transition-all',
            filterStatus === key ? 'ring-2 ring-cinnabar-400' : ''
          ]"
          @click="filterStatus = filterStatus === key ? '' : (key as InspectionStatus)"
        >
          <div class="flex items-center gap-2 mb-1">
            <component :is="statusIconMap[key as InspectionStatus]" class="w-4 h-4 text-ink-500" />
            <span class="text-xs text-ink-500">{{ label }}</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-ink-800 font-serif">
            {{ statusStats[key as keyof typeof statusStats] }}
          </div>
        </button>
      </div>

      <div class="scroll-card p-3 sm:p-4">
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-1.5 text-sm text-ink-600">
            <Filter class="w-4 h-4" />
            <span>筛选:</span>
          </div>
          <select v-model="filterStory" class="select-base !w-auto !py-1.5">
            <option value="">全部故事</option>
            <option v-for="story in allStories" :key="story" :value="story">{{ story }}</option>
          </select>
          <select v-model="filterAssignee" class="select-base !w-auto !py-1.5">
            <option value="">全部负责人</option>
            <option v-for="a in allAssignees" :key="a" :value="a">{{ a }}</option>
            <option value="__unassigned__">未分配</option>
          </select>
          <select v-model="filterStatus" class="select-base !w-auto !py-1.5">
            <option value="">全部状态</option>
            <option v-for="(label, key) in INSPECTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="filterSeverity" class="select-base !w-auto !py-1.5">
            <option value="">全部严重程度</option>
            <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="filterSourceType" class="select-base !w-auto !py-1.5">
            <option value="">全部来源</option>
            <option v-for="(label, key) in INSPECTION_SOURCE_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <button
            v-if="filterCharacterId || filterPlanId"
            class="btn-secondary !py-1 !px-2.5 text-xs"
            @click="filterCharacterId = ''; filterPlanId = ''"
          >
            <X class="w-3.5 h-3.5" />
            清除来源定位
          </button>
          <span class="text-xs text-ink-400 ml-auto">共 {{ filteredTasks.length }} 条任务</span>
        </div>
      </div>

      <div class="space-y-2 sm:space-y-3">
        <div
          v-if="filteredTasks.length === 0"
          class="text-center py-12 text-ink-400 bg-rice-50 rounded-lg border border-rice-200 border-dashed"
        >
          <p class="text-sm">当前筛选条件下暂无巡检任务</p>
        </div>

        <div
          v-for="task in filteredTasks"
          :key="task.id"
          :class="[
            'scroll-card overflow-hidden transition-all',
            task.status === 'blocked' ? 'ring-2 ring-red-300' : '',
            task.severity === 'critical' && task.status !== 'resolved' && task.status !== 'dismissed' ? 'ring-1 ring-orange-300' : '',
          ]"
        >
          <div class="p-3 sm:p-4">
            <div class="flex flex-wrap items-center gap-2 mb-1.5">
              <h4
                :class="[
                  'font-serif text-base sm:text-lg font-bold',
                  task.status === 'resolved' || task.status === 'dismissed' ? 'text-ink-400 line-through' : 'text-ink-800'
                ]"
              >
                {{ task.title }}
              </h4>
              <span :class="['tag border shrink-0', severityColors[task.severity]]">
                <AlertOctagon v-if="task.severity === 'critical'" class="w-3 h-3 mr-1" />
                {{ INSPECTION_SEVERITY_LABELS[task.severity] }}风险
              </span>
              <span :class="['tag border shrink-0 flex items-center gap-1', statusColors[task.status]]">
                <component :is="statusIconMap[task.status]" class="w-3 h-3" />
                {{ INSPECTION_STATUS_LABELS[task.status] }}
              </span>
              <span class="tag border bg-rice-100 text-ink-600 border-rice-300 shrink-0">
                {{ task.story }}
              </span>
              <span
                v-if="isOverdue(task)"
                class="tag border bg-red-50 text-red-600 border-red-200 shrink-0"
              >
                已逾期
              </span>
            </div>

            <p v-if="task.description" class="text-xs sm:text-sm text-ink-600 mb-2 line-clamp-2">
              {{ task.description }}
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-3">
              <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                <User class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                <span v-if="task.assignee" class="text-ink-700 truncate">{{ task.assignee }}</span>
                <span v-else class="text-red-500 font-medium">未分配负责人</span>
              </div>
              <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                <Calendar class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                <span :class="isOverdue(task) ? 'text-red-600 font-medium' : 'text-ink-600'">
                  截止 {{ formatDate(task.dueAt) }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                <Link2 class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                <span class="text-ink-600">来源：{{ INSPECTION_SOURCE_LABELS[task.sourceType] }}</span>
                <button
                  v-if="task.sourceType !== 'manual'"
                  class="inline-flex items-center gap-1 text-cinnabar-600 hover:text-cinnabar-700 hover:underline font-medium"
                  @click="goToSource(task)"
                >
                  <ExternalLink class="w-3.5 h-3.5" />
                  跳转来源
                </button>
                <span v-else class="text-ink-400">无来源页面</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-rice-100">
              <span v-if="task.characterId" class="text-xs text-ink-400">
                关联角色：{{ characterName(task.characterId) }}
              </span>
              <span v-if="task.resolvedAt" class="text-xs text-ink-400">
                解决于 {{ formatDate(task.resolvedAt) }}
              </span>
              <div class="flex flex-wrap gap-2 ml-auto">
                <button
                  v-if="task.status === 'open' || task.status === 'blocked'"
                  class="btn-secondary !py-1 !px-2.5 text-xs !bg-yellow-50 !text-yellow-700 !border-yellow-200 hover:!bg-yellow-100"
                  @click="quickStatus(task, 'in_progress')"
                >
                  <Clock class="w-3.5 h-3.5" />
                  开始处理
                </button>
                <button
                  v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                  class="btn-secondary !py-1 !px-2.5 text-xs !bg-bamboo-50 !text-bamboo-700 !border-bamboo-200 hover:!bg-bamboo-100"
                  @click="handleResolve(task)"
                >
                  <CheckCircle class="w-3.5 h-3.5" />
                  标记解决
                </button>
                <button
                  v-if="task.status === 'resolved' || task.status === 'dismissed'"
                  class="btn-secondary !py-1 !px-2.5 text-xs"
                  @click="quickStatus(task, 'open')"
                >
                  <RefreshCw class="w-3.5 h-3.5" />
                  重新打开
                </button>
                <button
                  v-if="task.status === 'open' || task.status === 'in_progress'"
                  class="btn-secondary !py-1 !px-2.5 text-xs !bg-gray-50 !text-gray-600 !border-gray-200 hover:!bg-gray-100"
                  @click="quickStatus(task, 'dismissed')"
                >
                  <XCircle class="w-3.5 h-3.5" />
                  忽略
                </button>
                <button class="btn-secondary !py-1 !px-2.5 text-xs" @click="openEdit(task)">
                  <Edit3 class="w-3.5 h-3.5" />
                  编辑
                </button>
                <button
                  class="btn-secondary !py-1 !px-2.5 text-xs !bg-red-50 !text-red-600 !border-red-200 hover:!bg-red-100"
                  @click="handleDelete(task)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-5 py-4 border-b border-rice-200">
          <h3 class="font-serif text-lg font-bold text-ink-800">
            {{ editingTaskId ? '编辑巡检任务' : '新建巡检任务' }}
          </h3>
          <button class="p-1 rounded hover:bg-rice-100 text-ink-400" @click="closeModal">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-5 space-y-3">
          <div>
            <label class="label-base">任务标题 *</label>
            <input v-model="form.title" class="input-base" placeholder="例如：补齐孙悟空的金箍棒" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">所属故事</label>
              <input v-model="form.story" class="input-base" list="inspection-story-list" placeholder="选择或输入故事" />
              <datalist id="inspection-story-list">
                <option v-for="story in allStories" :key="story" :value="story" />
              </datalist>
            </div>
            <div>
              <label class="label-base">关联角色</label>
              <select v-model="form.characterId" class="select-base" @change="onPickCharacter">
                <option value="">不关联</option>
                <option v-for="char in characters" :key="char.id" :value="char.id">
                  {{ char.name }}（{{ char.story }}）
                </option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">严重程度</label>
              <select v-model="form.severity" class="select-base">
                <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div v-if="editingTaskId">
              <label class="label-base">状态</label>
              <select v-model="form.status" class="select-base">
                <option v-for="(label, key) in INSPECTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div v-else>
              <label class="label-base">截止时间</label>
              <input v-model="form.dueAt" type="datetime-local" class="input-base" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label-base">负责人</label>
              <input v-model="form.assignee" class="input-base" placeholder="任务负责人" />
            </div>
            <div v-if="editingTaskId">
              <label class="label-base">截止时间</label>
              <input v-model="form.dueAt" type="datetime-local" class="input-base" />
            </div>
          </div>
          <div>
            <label class="label-base">任务描述</label>
            <textarea v-model="form.description" class="input-base resize-none" rows="3" placeholder="补充任务背景、处理要求等..." />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button class="btn-secondary !py-1.5" @click="closeModal">
              <X class="w-4 h-4" />
              取消
            </button>
            <button class="btn-primary !py-1.5" @click="saveModal">
              <Save class="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
