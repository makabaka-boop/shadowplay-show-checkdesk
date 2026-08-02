<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Search,
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Ban,
  ExternalLink,
  Trash2,
  User,
  Calendar,
  Flag,
  BookOpen,
  ClipboardCheck,
  Theater,
  Edit3,
  X,
  RefreshCw,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useCharacters } from '../composables/useCharacters';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useToast } from '../composables/useToast';
import type { InspectionTask, TaskStatus, TaskSeverity, TaskSourceType } from '../types';
import {
  TASK_STATUS_LABELS,
  TASK_SEVERITY_LABELS,
  TASK_SOURCE_LABELS,
} from '../types';

const router = useRouter();
const route = useRoute();
const { success } = useToast();
const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  resolveTask,
  syncTasksFromCharacters,
  allStories,
  allAssignees,
  stats,
} = useInspectionTasks();
const { characters } = useCharacters();
const { rehearsalPlans } = useRehearsalPlans();

const searchQuery = ref('');
const filterStory = ref('');
const filterAssignee = ref('');
const filterStatus = ref<TaskStatus | ''>('');
const filterSeverity = ref<TaskSeverity | ''>('');
const filterSource = ref<TaskSourceType | ''>('');

const showCreateModal = ref(false);
const editingTask = ref<InspectionTask | null>(null);

const formData = ref({
  title: '',
  description: '',
  story: '三打白骨精',
  severity: 'medium' as TaskSeverity,
  status: 'open' as TaskStatus,
  assignee: '',
  dueAt: '',
  characterId: '' as string | '',
  planId: '' as string | '',
});

const statusOptions: TaskStatus[] = ['open', 'in_progress', 'blocked', 'resolved', 'dismissed'];
const severityOptions: TaskSeverity[] = ['low', 'medium', 'high', 'critical'];
const sourceOptions: TaskSourceType[] = ['character', 'handover', 'rehearsal', 'manual'];

const filteredTasks = computed(() => {
  return tasks.value
    .filter(t => {
      if (filterStory.value && t.story !== filterStory.value) return false;
      if (filterAssignee.value && t.assignee !== filterAssignee.value) return false;
      if (filterStatus.value && t.status !== filterStatus.value) return false;
      if (filterSeverity.value && t.severity !== filterSeverity.value) return false;
      if (filterSource.value && t.sourceType !== filterSource.value) return false;
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const severityOrder: Record<TaskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const statusOrder: Record<TaskStatus, number> = { open: 0, in_progress: 1, blocked: 2, resolved: 4, dismissed: 5 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
});

const storyOptions = computed(() => {
  const set = new Set([...allStories.value, ...characters.value.map(c => c.story)]);
  return Array.from(set).sort();
});

const planOptions = computed(() => rehearsalPlans.value);

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isOverdue(task: InspectionTask): boolean {
  if (!task.dueAt || task.status === 'resolved' || task.status === 'dismissed') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

function getStatusClass(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    open: 'bg-blue-100 text-blue-700 border-blue-200',
    in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
    blocked: 'bg-red-100 text-red-700 border-red-200',
    resolved: 'bg-green-100 text-green-700 border-green-200',
    dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return map[status];
}

function getSeverityClass(severity: TaskSeverity): string {
  const map: Record<TaskSeverity, string> = {
    low: 'bg-gray-100 text-gray-700 border-gray-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  };
  return map[severity];
}

function getSourceIcon(source: TaskSourceType) {
  const map = {
    character: BookOpen,
    handover: ClipboardCheck,
    rehearsal: Theater,
    manual: Edit3,
  };
  return map[source];
}

function goToSource(task: InspectionTask) {
  if (task.sourceType === 'character' && task.characterId) {
    router.push({ path: '/', query: { character: task.characterId } });
  } else if (task.sourceType === 'handover' && task.characterId) {
    router.push({ path: '/handover', query: { character: task.characterId } });
  } else if (task.sourceType === 'rehearsal' && task.planId) {
    router.push(`/rehearsal/${task.planId}`);
  }
}

function openCreate() {
  editingTask.value = null;
  formData.value = {
    title: '',
    description: '',
    story: storyOptions.value[0] || '三打白骨精',
    severity: 'medium',
    status: 'open',
    assignee: '',
    dueAt: '',
    characterId: '',
    planId: '',
  };
  showCreateModal.value = true;
}

function openEdit(task: InspectionTask) {
  editingTask.value = task;
  formData.value = {
    title: task.title,
    description: task.description,
    story: task.story,
    severity: task.severity,
    status: task.status,
    assignee: task.assignee,
    dueAt: task.dueAt ? task.dueAt.slice(0, 16) : '',
    characterId: task.characterId || '',
    planId: task.planId || '',
  };
  showCreateModal.value = true;
}

function closeModal() {
  showCreateModal.value = false;
  editingTask.value = null;
}

function saveTask() {
  if (!formData.value.title.trim()) return;

  if (editingTask.value) {
    updateTask(editingTask.value.id, {
      title: formData.value.title,
      description: formData.value.description,
      story: formData.value.story,
      severity: formData.value.severity,
      status: formData.value.status,
      assignee: formData.value.assignee,
      dueAt: formData.value.dueAt,
      characterId: formData.value.characterId || null,
      planId: formData.value.planId || null,
    });
    success('任务已更新');
  } else {
    addTask({
      sourceType: 'manual',
      sourceId: 'manual_' + Date.now(),
      title: formData.value.title,
      description: formData.value.description,
      story: formData.value.story,
      severity: formData.value.severity,
      status: formData.value.status,
      assignee: formData.value.assignee,
      dueAt: formData.value.dueAt,
      characterId: formData.value.characterId || null,
      planId: formData.value.planId || null,
      resolvedAt: '',
    });
    success('任务已创建');
  }
  closeModal();
}

function handleResolve(id: string) {
  resolveTask(id);
  success('任务已标记为解决');
}

function handleDelete(id: string) {
  if (confirm('确定删除该任务？')) {
    deleteTask(id);
    success('任务已删除');
  }
}

function handleSync() {
  const result = syncTasksFromCharacters(characters.value, rehearsalPlans.value);
  if (result.added > 0 || result.blocked > 0) {
    success(`同步完成：新增 ${result.added} 个任务，${result.blocked} 个任务已阻塞`);
  } else {
    success('同步完成：没有新任务需要创建');
  }
}

function clearFilters() {
  filterStory.value = '';
  filterAssignee.value = '';
  filterStatus.value = '';
  filterSeverity.value = '';
  filterSource.value = '';
  searchQuery.value = '';
}

onMounted(() => {
  syncTasksFromCharacters(characters.value, rehearsalPlans.value);
  if (route.query.story && typeof route.query.story === 'string') {
    filterStory.value = route.query.story;
  }
  if (route.query.status && typeof route.query.status === 'string') {
    const s = route.query.status;
    if (['open', 'in_progress', 'blocked', 'resolved', 'dismissed'].includes(s)) {
      filterStatus.value = s as TaskStatus;
    }
  }
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-rice-50">
    <TopBar />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 class="font-serif text-2xl font-bold text-ink-800 flex items-center gap-2">
            <Flag class="w-6 h-6 text-cinnabar-600" />
            巡检任务中心
          </h2>
          <p class="text-sm text-ink-500 mt-1">统一沉淀角色清单、故事检查、交接核对、排练计划中的风险项</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary !py-2 flex items-center gap-1.5"
            @click="handleSync"
          >
            <RefreshCw class="w-4 h-4" />
            同步风险项
          </button>
          <button class="btn-primary !py-2 flex items-center gap-1.5" @click="openCreate">
            <Plus class="w-4 h-4" />
            新建任务
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div class="bg-white rounded-lg border border-ink-200 p-3 text-center">
          <div class="text-2xl font-bold text-ink-800">{{ stats.total }}</div>
          <div class="text-xs text-ink-500 mt-0.5">全部任务</div>
        </div>
        <div class="bg-white rounded-lg border border-blue-200 p-3 text-center">
          <div class="text-2xl font-bold text-blue-600">{{ stats.open }}</div>
          <div class="text-xs text-ink-500 mt-0.5">待处理</div>
        </div>
        <div class="bg-white rounded-lg border border-amber-200 p-3 text-center">
          <div class="text-2xl font-bold text-amber-600">{{ stats.inProgress }}</div>
          <div class="text-xs text-ink-500 mt-0.5">进行中</div>
        </div>
        <div class="bg-white rounded-lg border border-red-200 p-3 text-center">
          <div class="text-2xl font-bold text-red-600">{{ stats.blocked }}</div>
          <div class="text-xs text-ink-500 mt-0.5">已阻塞</div>
        </div>
        <div class="bg-white rounded-lg border border-green-200 p-3 text-center">
          <div class="text-2xl font-bold text-green-600">{{ stats.resolved }}</div>
          <div class="text-xs text-ink-500 mt-0.5">已解决</div>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <div class="text-2xl font-bold text-gray-600">{{ stats.dismissed }}</div>
          <div class="text-xs text-ink-500 mt-0.5">已忽略</div>
        </div>
        <div class="bg-white rounded-lg border border-red-300 bg-red-50 p-3 text-center">
          <div class="text-2xl font-bold text-red-700">{{ stats.critical }}</div>
          <div class="text-xs text-red-600 mt-0.5">严重未解决</div>
        </div>
        <div class="bg-white rounded-lg border border-orange-300 bg-orange-50 p-3 text-center">
          <div class="text-2xl font-bold text-orange-700">{{ stats.high }}</div>
          <div class="text-xs text-orange-600 mt-0.5">高风险未解决</div>
        </div>
      </div>

      <div class="bg-white rounded-lg border border-ink-200 p-3">
        <div class="flex flex-col lg:flex-row gap-3">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索任务标题、描述或负责人..."
              class="w-full pl-9 pr-3 py-2 border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30 focus:border-cinnabar-500"
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <select v-model="filterStory" class="px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
              <option value="">全部故事</option>
              <option v-for="s in storyOptions" :key="s" :value="s">{{ s }}</option>
            </select>
            <select v-model="filterAssignee" class="px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
              <option value="">全部负责人</option>
              <option v-for="a in allAssignees" :key="a" :value="a">{{ a }}</option>
            </select>
            <select v-model="filterStatus" class="px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
              <option value="">全部状态</option>
              <option v-for="s in statusOptions" :key="s" :value="s">{{ TASK_STATUS_LABELS[s] }}</option>
            </select>
            <select v-model="filterSeverity" class="px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
              <option value="">全部严重度</option>
              <option v-for="s in severityOptions" :key="s" :value="s">{{ TASK_SEVERITY_LABELS[s] }}</option>
            </select>
            <select v-model="filterSource" class="px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
              <option value="">全部来源</option>
              <option v-for="s in sourceOptions" :key="s" :value="s">{{ TASK_SOURCE_LABELS[s] }}</option>
            </select>
            <button
              v-if="filterStory || filterAssignee || filterStatus || filterSeverity || filterSource || searchQuery"
              class="px-3 py-2 text-sm text-ink-500 hover:text-ink-700 flex items-center gap-1"
              @click="clearFilters"
            >
              <X class="w-4 h-4" />
              清除
            </button>
          </div>
        </div>
      </div>

      <div v-if="filteredTasks.length === 0" class="bg-white rounded-lg border border-ink-200 p-12 text-center">
        <CheckCircle2 class="w-12 h-12 text-ink-300 mx-auto mb-3" />
        <p class="text-ink-500">暂无符合条件的任务</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          class="bg-white rounded-lg border border-ink-200 p-4 hover:shadow-md transition-shadow flex flex-col"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
                :class="getSeverityClass(task.severity)"
              >
                <AlertTriangle class="w-3 h-3" />
                {{ TASK_SEVERITY_LABELS[task.severity] }}
              </span>
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
                :class="getStatusClass(task.status)"
              >
                <component :is="task.status === 'resolved' ? CheckCircle2 : task.status === 'in_progress' ? Clock : task.status === 'blocked' ? Ban : task.status === 'dismissed' ? XCircle : AlertTriangle" class="w-3 h-3" />
                {{ TASK_STATUS_LABELS[task.status] }}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="task.status !== 'resolved' && task.status !== 'dismissed'"
                class="p-1 text-green-600 hover:bg-green-50 rounded"
                title="标记解决"
                @click="handleResolve(task.id)"
              >
                <CheckCircle2 class="w-4 h-4" />
              </button>
              <button class="p-1 text-ink-500 hover:bg-ink-50 rounded" title="编辑" @click="openEdit(task)">
                <Edit3 class="w-4 h-4" />
              </button>
              <button class="p-1 text-red-500 hover:bg-red-50 rounded" title="删除" @click="handleDelete(task.id)">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <h3 class="font-semibold text-ink-800 mb-1 leading-snug" :class="{ 'line-through text-ink-400': task.status === 'resolved' || task.status === 'dismissed' }">
            {{ task.title }}
          </h3>
          <p class="text-sm text-ink-600 mb-3 flex-1 whitespace-pre-wrap line-clamp-3">{{ task.description }}</p>

          <div class="flex flex-col gap-1.5 text-xs text-ink-500 mb-3">
            <div class="flex items-center gap-1.5">
              <component :is="getSourceIcon(task.sourceType)" class="w-3.5 h-3.5 text-ink-400" />
              <span>来源：{{ TASK_SOURCE_LABELS[task.sourceType] }}</span>
              <span class="text-ink-300">·</span>
              <span>{{ task.story }}</span>
            </div>
            <div v-if="task.assignee" class="flex items-center gap-1.5">
              <User class="w-3.5 h-3.5 text-ink-400" />
              <span>负责人：{{ task.assignee }}</span>
            </div>
            <div v-if="task.dueAt" class="flex items-center gap-1.5" :class="{ 'text-red-600 font-medium': isOverdue(task) }">
              <Calendar class="w-3.5 h-3.5" />
              <span>截止：{{ formatDate(task.dueAt) }}</span>
              <span v-if="isOverdue(task)" class="text-red-600">（已逾期）</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-ink-100">
            <button
              v-if="task.sourceType !== 'manual' && (task.characterId || task.planId)"
              class="inline-flex items-center gap-1 text-xs text-cinnabar-600 hover:text-cinnabar-700 font-medium"
              @click="goToSource(task)"
            >
              <ExternalLink class="w-3.5 h-3.5" />
              查看来源
            </button>
            <span v-else class="text-xs text-ink-400">手工任务</span>
            <span class="text-xs text-ink-400">{{ formatDate(task.createdAt) }}</span>
          </div>
        </div>
      </div>
    </main>

    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" @click.self="closeModal">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-4 border-b border-ink-200">
          <h3 class="font-serif text-lg font-bold text-ink-800">
            {{ editingTask ? '编辑任务' : '新建巡检任务' }}
          </h3>
          <button class="p-1 text-ink-400 hover:text-ink-600" @click="closeModal">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 space-y-3">
          <div>
            <label class="block text-sm font-medium text-ink-700 mb-1">任务标题 <span class="text-red-500">*</span></label>
            <input v-model="formData.title" type="text" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30" placeholder="请输入任务标题" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-700 mb-1">任务描述</label>
            <textarea v-model="formData.description" rows="3" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30" placeholder="请输入任务描述"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-ink-700 mb-1">所属故事</label>
              <select v-model="formData.story" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
                <option v-for="s in storyOptions" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-ink-700 mb-1">负责人</label>
              <input v-model="formData.assignee" type="text" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30" placeholder="负责人姓名" />
            </div>
            <div>
              <label class="block text-sm font-medium text-ink-700 mb-1">严重程度</label>
              <select v-model="formData.severity" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
                <option v-for="s in severityOptions" :key="s" :value="s">{{ TASK_SEVERITY_LABELS[s] }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-ink-700 mb-1">状态</label>
              <select v-model="formData.status" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
                <option v-for="s in statusOptions" :key="s" :value="s">{{ TASK_STATUS_LABELS[s] }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-ink-700 mb-1">截止时间</label>
              <input v-model="formData.dueAt" type="datetime-local" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30" />
            </div>
            <div>
              <label class="block text-sm font-medium text-ink-700 mb-1">关联角色（可选）</label>
              <select v-model="formData.characterId" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
                <option value="">无关联</option>
                <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}（{{ c.story }}）</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-ink-700 mb-1">关联排练计划（可选）</label>
              <select v-model="formData.planId" class="w-full px-3 py-2 border border-ink-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30">
                <option value="">无关联</option>
                <option v-for="p in planOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 p-4 border-t border-ink-200">
          <button class="btn-secondary !py-2" @click="closeModal">取消</button>
          <button class="btn-primary !py-2" @click="saveTask">保存</button>
        </div>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
