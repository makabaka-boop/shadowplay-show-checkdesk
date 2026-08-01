<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  ClipboardList,
  Filter,
  Plus,
  Check,
  X,
  Trash2,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  User,
  Calendar,
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
  InspectionStatus,
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
} = useInspectionTasks();
const { characters, getCharacterById, allStories, allOwners } = useCharacters();
const { success, info } = useToast();

// ==================== 筛选 ====================
const filterStory = ref<string>('');
const filterAssignee = ref<string>('');
const filterStatus = ref<InspectionStatus | ''>('');
const filterSeverity = ref<InspectionSeverity | ''>('');

const severityOrder: Record<InspectionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const allAssignees = computed(() => {
  const set = new Set(tasks.value.map(t => t.assignee).filter(Boolean));
  return Array.from(set).sort();
});

const filteredTasks = computed(() => {
  return tasks.value
    .filter(t => !filterStory.value || t.story === filterStory.value)
    .filter(t => !filterAssignee.value || t.assignee === filterAssignee.value)
    .filter(t => !filterStatus.value || t.status === filterStatus.value)
    .filter(t => !filterSeverity.value || t.severity === filterSeverity.value)
    .slice()
    .sort((a, b) => {
      // 未解决优先，然后按严重程度
      const aDone = a.status === 'resolved' || a.status === 'dismissed';
      const bDone = b.status === 'resolved' || b.status === 'dismissed';
      if (aDone !== bDone) return aDone ? 1 : -1;
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
});

const stats = computed(() => {
  const open = tasks.value.filter(t => t.status === 'open').length;
  const inProgress = tasks.value.filter(t => t.status === 'in_progress').length;
  const blocked = tasks.value.filter(t => t.status === 'blocked').length;
  const resolved = tasks.value.filter(t => t.status === 'resolved').length;
  return { total: tasks.value.length, open, inProgress, blocked, resolved };
});

function resetFilters() {
  filterStory.value = '';
  filterAssignee.value = '';
  filterStatus.value = '';
  filterSeverity.value = '';
}

// ==================== 来源反查 ====================
function characterName(id: string): string {
  return getCharacterById(id)?.name ?? '';
}

function sourceLabel(task: InspectionTask): string {
  const base = INSPECTION_SOURCE_LABELS[task.sourceType];
  const cName = task.characterId ? characterName(task.characterId) : '';
  if (cName) return `${base} · ${cName}`;
  return base;
}

function jumpToSource(task: InspectionTask) {
  switch (task.sourceType) {
    case 'rehearsal':
      if (task.planId) {
        router.push(`/rehearsal/${task.planId}`);
      } else {
        router.push('/rehearsal');
      }
      break;
    case 'handover':
      router.push('/handover');
      break;
    case 'character':
      router.push('/checklist');
      break;
    case 'manual':
    default:
      router.push('/checklist');
      break;
  }
}

// ==================== 状态操作 ====================
function handleResolve(task: InspectionTask) {
  resolveTask(task.id);
  success(`已解决任务：${task.title}`);
}

function handleAdvance(task: InspectionTask) {
  updateTask(task.id, { status: 'in_progress' });
  info(`任务已进入处理中：${task.title}`);
}

function handleDismiss(task: InspectionTask) {
  updateTask(task.id, { status: 'dismissed' });
  info(`已忽略任务：${task.title}`);
}

function handleReopen(task: InspectionTask) {
  updateTask(task.id, { status: 'open', resolvedAt: '' });
  info(`已重新打开任务：${task.title}`);
}

function handleDelete(task: InspectionTask) {
  if (window.confirm(`确定删除任务「${task.title}」吗？`)) {
    deleteTask(task.id);
    success('任务已删除');
  }
}

function handleUpdateAssignee(task: InspectionTask, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  updateTask(task.id, { assignee: value });
}

function handleSync() {
  const created = syncTasksFromCharacters(characters.value);
  if (created > 0) {
    success(`已从角色清单同步 ${created} 个新任务`);
  } else {
    info('没有需要新增的任务，现有任务未被覆盖');
  }
}

// ==================== 新建任务 ====================
const showCreate = ref(false);
const draftTitle = ref('');
const draftStory = ref('');
const draftCharacterId = ref('');
const draftSeverity = ref<InspectionSeverity>('medium');
const draftAssignee = ref('');
const draftDueAt = ref('');
const draftDescription = ref('');

function openCreate() {
  draftTitle.value = '';
  draftStory.value = allStories.value[0] ?? '';
  draftCharacterId.value = '';
  draftSeverity.value = 'medium';
  draftAssignee.value = '';
  draftDueAt.value = '';
  draftDescription.value = '';
  showCreate.value = true;
}

const draftStoryCharacters = computed(() =>
  characters.value.filter(c => !draftStory.value || c.story === draftStory.value)
);

function submitCreate() {
  if (!draftTitle.value.trim()) {
    info('请填写任务标题');
    return;
  }
  const char = draftCharacterId.value ? getCharacterById(draftCharacterId.value) : undefined;
  addTask({
    sourceType: 'manual',
    sourceId: '',
    story: char?.story || draftStory.value || '未分类',
    characterId: draftCharacterId.value,
    planId: '',
    title: draftTitle.value.trim(),
    description: draftDescription.value.trim(),
    severity: draftSeverity.value,
    status: 'open',
    assignee: draftAssignee.value.trim(),
    dueAt: draftDueAt.value ? new Date(draftDueAt.value).toISOString() : '',
  });
  success('已创建手工任务');
  showCreate.value = false;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const severityClass: Record<InspectionSeverity, string> = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const statusClass: Record<InspectionStatus, string> = {
  open: 'bg-sky-50 text-sky-700 border-sky-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blocked: 'bg-rose-50 text-rose-700 border-rose-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed: 'bg-ink-100 text-ink-500 border-ink-200',
};

const sourceTypeList: InspectionSourceType[] = ['character', 'handover', 'rehearsal', 'manual'];
void sourceTypeList;

onMounted(() => {
  // 首次进入时静默补齐角色清单缺失任务（不覆盖已有）
  syncTasksFromCharacters(characters.value);
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-rice-50">
    <TopBar />

    <main class="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <!-- 标题与统计 -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-2">
          <ClipboardList class="w-6 h-6 text-cinnabar-600" />
          <div>
            <h2 class="font-serif text-xl font-bold text-ink-800">巡检任务中心</h2>
            <p class="text-xs text-ink-500">统一沉淀角色清单、故事检查、交接核对、排练计划的风险项</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary !py-1.5" @click="handleSync">
            <RefreshCw class="w-4 h-4" />
            <span>同步角色任务</span>
          </button>
          <button class="btn-primary !py-1.5" @click="openCreate">
            <Plus class="w-4 h-4" />
            <span>新建任务</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div class="bg-white rounded-lg border border-ink-200 p-3 text-center">
          <div class="text-2xl font-bold text-ink-800">{{ stats.total }}</div>
          <div class="text-xs text-ink-500">全部任务</div>
        </div>
        <div class="bg-white rounded-lg border border-ink-200 p-3 text-center">
          <div class="text-2xl font-bold text-sky-600">{{ stats.open }}</div>
          <div class="text-xs text-ink-500">待处理</div>
        </div>
        <div class="bg-white rounded-lg border border-ink-200 p-3 text-center">
          <div class="text-2xl font-bold text-indigo-600">{{ stats.inProgress }}</div>
          <div class="text-xs text-ink-500">处理中</div>
        </div>
        <div class="bg-white rounded-lg border border-ink-200 p-3 text-center">
          <div class="text-2xl font-bold text-rose-600">{{ stats.blocked }}</div>
          <div class="text-xs text-ink-500">已阻塞</div>
        </div>
        <div class="bg-white rounded-lg border border-ink-200 p-3 text-center">
          <div class="text-2xl font-bold text-emerald-600">{{ stats.resolved }}</div>
          <div class="text-xs text-ink-500">已解决</div>
        </div>
      </div>

      <!-- 筛选 -->
      <div class="bg-white rounded-lg border border-ink-200 p-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-1.5 text-ink-600 text-sm font-medium">
            <Filter class="w-4 h-4" />筛选
          </div>
          <select v-model="filterStory" class="input-base !py-1 !text-sm !w-auto">
            <option value="">全部故事</option>
            <option v-for="s in allStories" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="filterAssignee" class="input-base !py-1 !text-sm !w-auto">
            <option value="">全部负责人</option>
            <option value="__unassigned__" disabled>——</option>
            <option v-for="a in allAssignees" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filterStatus" class="input-base !py-1 !text-sm !w-auto">
            <option value="">全部状态</option>
            <option v-for="(label, key) in INSPECTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="filterSeverity" class="input-base !py-1 !text-sm !w-auto">
            <option value="">全部严重程度</option>
            <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <button class="text-sm text-ink-500 hover:text-cinnabar-600 underline" @click="resetFilters">重置</button>
          <span class="text-sm text-ink-400 ml-auto">共 {{ filteredTasks.length }} 项</span>
        </div>
      </div>

      <!-- 任务列表 -->
      <div v-if="filteredTasks.length === 0" class="bg-white rounded-lg border border-ink-200 p-12 text-center text-ink-400">
        暂无符合条件的巡检任务
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          class="bg-white rounded-lg border border-ink-200 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs px-2 py-0.5 rounded border', severityClass[task.severity]]">
                  {{ INSPECTION_SEVERITY_LABELS[task.severity] }}风险
                </span>
                <span :class="['text-xs px-2 py-0.5 rounded border', statusClass[task.status]]">
                  {{ INSPECTION_STATUS_LABELS[task.status] }}
                </span>
                <span class="text-xs px-2 py-0.5 rounded border bg-rice-100 text-ink-600 border-ink-200">
                  {{ task.story }}
                </span>
              </div>
              <h3 class="mt-2 font-medium text-ink-800 break-words">{{ task.title }}</h3>
              <p v-if="task.description" class="mt-1 text-sm text-ink-500 whitespace-pre-line break-words">
                {{ task.description }}
              </p>
            </div>
            <AlertTriangle
              v-if="task.severity === 'critical' || task.status === 'blocked'"
              class="w-5 h-5 text-red-500 shrink-0"
            />
          </div>

          <!-- 来源跳转入口 -->
          <button
            class="self-start inline-flex items-center gap-1 text-xs text-cinnabar-600 hover:text-cinnabar-700 bg-cinnabar-50 border border-cinnabar-200 rounded px-2 py-1 transition-colors"
            @click="jumpToSource(task)"
          >
            <ArrowUpRight class="w-3.5 h-3.5" />
            来源：{{ sourceLabel(task) }}
          </button>

          <!-- 责任人 / 截止 -->
          <div class="flex flex-wrap items-center gap-3 text-xs text-ink-500">
            <label class="flex items-center gap-1">
              <User class="w-3.5 h-3.5" />
              <input
                :value="task.assignee"
                placeholder="未分配"
                class="input-base !py-0.5 !px-1.5 !text-xs !w-28"
                @change="handleUpdateAssignee(task, $event)"
              />
            </label>
            <span v-if="task.dueAt" class="flex items-center gap-1">
              <Calendar class="w-3.5 h-3.5" />截止 {{ formatDate(task.dueAt) }}
            </span>
            <span v-if="task.resolvedAt" class="flex items-center gap-1 text-emerald-600">
              <Check class="w-3.5 h-3.5" />{{ formatDate(task.resolvedAt) }} 解决
            </span>
          </div>

          <!-- 操作 -->
          <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-ink-100">
            <button
              v-if="task.status === 'open'"
              class="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              @click="handleAdvance(task)"
            >
              开始处理
            </button>
            <button
              v-if="task.status !== 'resolved'"
              class="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50 inline-flex items-center gap-1"
              @click="handleResolve(task)"
            >
              <Check class="w-3.5 h-3.5" />解决
            </button>
            <button
              v-if="task.status !== 'dismissed' && task.status !== 'resolved'"
              class="text-xs px-2 py-1 rounded border border-ink-200 text-ink-500 hover:bg-ink-50 inline-flex items-center gap-1"
              @click="handleDismiss(task)"
            >
              <X class="w-3.5 h-3.5" />忽略
            </button>
            <button
              v-if="task.status === 'resolved' || task.status === 'dismissed'"
              class="text-xs px-2 py-1 rounded border border-sky-200 text-sky-600 hover:bg-sky-50"
              @click="handleReopen(task)"
            >
              重新打开
            </button>
            <button
              class="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 inline-flex items-center gap-1 ml-auto"
              @click="handleDelete(task)"
            >
              <Trash2 class="w-3.5 h-3.5" />删除
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- 新建任务弹窗 -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="showCreate = false"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <h3 class="font-serif text-lg font-bold text-ink-800">新建巡检任务</h3>
          <button class="text-ink-400 hover:text-ink-600" @click="showCreate = false">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-sm text-ink-600 mb-1">任务标题 *</label>
            <input v-model="draftTitle" class="input-base" placeholder="请输入任务标题" />
          </div>
          <div>
            <label class="block text-sm text-ink-600 mb-1">所属故事</label>
            <select v-model="draftStory" class="input-base">
              <option value="">未分类</option>
              <option v-for="s in allStories" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-ink-600 mb-1">关联角色（用于来源反查）</label>
            <select v-model="draftCharacterId" class="input-base">
              <option value="">不关联</option>
              <option v-for="c in draftStoryCharacters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm text-ink-600 mb-1">严重程度</label>
              <select v-model="draftSeverity" class="input-base">
                <option v-for="(label, key) in INSPECTION_SEVERITY_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-ink-600 mb-1">截止日期</label>
              <input v-model="draftDueAt" type="date" class="input-base" />
            </div>
          </div>
          <div>
            <label class="block text-sm text-ink-600 mb-1">责任人</label>
            <input v-model="draftAssignee" class="input-base" list="assignee-list" placeholder="可选" />
            <datalist id="assignee-list">
              <option v-for="a in allOwners" :key="a" :value="a" />
            </datalist>
          </div>
          <div>
            <label class="block text-sm text-ink-600 mb-1">描述</label>
            <textarea v-model="draftDescription" rows="3" class="input-base" placeholder="补充说明"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button class="btn-secondary" @click="showCreate = false">取消</button>
          <button class="btn-primary" @click="submitCreate">创建</button>
        </div>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
