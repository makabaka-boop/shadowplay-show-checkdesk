<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  LayoutDashboard,
  AlertTriangle,
  AlertOctagon,
  ClipboardCheck,
  Theater,
  ListTodo,
  ArrowUpRight,
  ArrowRight,
  CalendarClock,
  Ban,
  PieChart,
  CheckCircle,
  Home,
  Filter,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useCharacters } from '../composables/useCharacters';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import type {
  InspectionTask,
  InspectionSeverity,
  InspectionStatus,
  Character,
} from '../types';
import {
  INSPECTION_SOURCE_LABELS,
  INSPECTION_SEVERITY_LABELS,
  INSPECTION_STATUS_LABELS,
} from '../types';

const router = useRouter();
const { characters, getCharacterById } = useCharacters();
const { rehearsalPlans, getPlanStats, getPlanById } = useRehearsalPlans();
const { tasks, syncTasksFromCharacters } = useInspectionTasks();

// 进入工作台时静默补齐角色清单缺失任务（只补缺，不覆盖用户编辑）
onMounted(() => {
  syncTasksFromCharacters(characters.value);
});

// ==================== 通用工具 ====================
const severityOrder: Record<InspectionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const UNRESOLVED: InspectionStatus[] = ['open', 'in_progress', 'blocked'];

function isObjectiveRisk(c: Character): boolean {
  const missing = c.missingAccessories.some(a => a.available < a.required);
  const high = c.riskLevel === 'high' || c.riskLevel === 'critical';
  return missing || high || !c.owner;
}

// ==================== 指标一：角色风险 ====================
const characterRisk = computed(() => {
  const list = characters.value;
  const high = list.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length;
  const needParts = list.filter(c => c.missingAccessories.some(a => a.available < a.required)).length;
  const noOwner = list.filter(c => !c.owner).length;
  return { total: list.length, high, needParts, noOwner };
});

// ==================== 指标二：交接结论 ====================
const handoverConclusion = computed(() => {
  const list = characters.value;
  const hasRisk = list.filter(c => c.handoverStatus === 'has_risk' || isObjectiveRisk(c)).length;
  const followUp = list.filter(c => c.handoverStatus === 'follow_up' && !isObjectiveRisk(c)).length;
  const confirmed = list.filter(c => c.handoverStatus === 'confirmed' && !isObjectiveRisk(c)).length;
  let level: 'has_risk' | 'follow_up' | 'confirmed' = 'confirmed';
  if (hasRisk > 0) level = 'has_risk';
  else if (followUp > 0) level = 'follow_up';
  return { total: list.length, hasRisk, followUp, confirmed, level };
});

const handoverLevelText: Record<'has_risk' | 'follow_up' | 'confirmed', string> = {
  has_risk: '存在风险',
  follow_up: '需跟进',
  confirmed: '可交接',
};

// ==================== 指标三：排练进度 ====================
const rehearsalProgress = computed(() => {
  const plans = rehearsalPlans.value;
  let total = 0;
  let done = 0;
  let fail = 0;
  let needRehearse = 0;
  plans.forEach(p => {
    const s = getPlanStats(p);
    total += s.total;
    done += s.pass;
    fail += s.fail;
    needRehearse += s.needRehearse;
  });
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return { plans: plans.length, total, done, fail, needRehearse, progress };
});

// ==================== 指标四：巡检任务 ====================
const taskMetric = computed(() => {
  const list = tasks.value;
  const open = list.filter(t => t.status === 'open').length;
  const inProgress = list.filter(t => t.status === 'in_progress').length;
  const blocked = list.filter(t => t.status === 'blocked').length;
  const resolved = list.filter(t => t.status === 'resolved').length;
  const unresolved = open + inProgress + blocked;
  return { total: list.length, open, inProgress, blocked, resolved, unresolved };
});

// ==================== 来源反查 & 跳转 ====================
function characterName(id: string): string {
  return getCharacterById(id)?.name ?? '';
}

// 来源是否仍然存在（角色/计划是否可反查到）
function sourceExists(task: InspectionTask): boolean {
  if (task.characterId && !getCharacterById(task.characterId)) {
    if (task.sourceType !== 'rehearsal') return false;
  }
  if (task.sourceType === 'rehearsal') {
    return !!task.planId && !!getPlanById(task.planId);
  }
  if (task.sourceType === 'character' || task.sourceType === 'handover') {
    return !!task.characterId && !!getCharacterById(task.characterId);
  }
  // manual：关联角色可选
  return !task.characterId || !!getCharacterById(task.characterId);
}

function sourceLabel(task: InspectionTask): string {
  const base = INSPECTION_SOURCE_LABELS[task.sourceType];
  const cName = task.characterId ? characterName(task.characterId) : '';
  return cName ? `${base} · ${cName}` : base;
}

// 点击任务跳到对应上下文；来源缺失时不跳转，提示保留信息
function jumpToSource(task: InspectionTask) {
  if (!sourceExists(task)) return; // 来源缺失：保持 blocked 展示，不跳转
  switch (task.sourceType) {
    case 'rehearsal':
      router.push(task.planId ? `/rehearsal/${task.planId}` : '/rehearsal');
      break;
    case 'handover':
      router.push('/handover');
      break;
    case 'character':
    case 'manual':
    default:
      router.push('/checklist');
      break;
  }
}

// ==================== 区域一：今日待处理 ====================
function isToday(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function isOverdue(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now() && !isToday(iso);
}

// 今日待处理：未解决且（截止今天/已逾期，或 critical 高危）——按严重度排序
const todayTasks = computed(() => {
  return tasks.value
    .filter(t => UNRESOLVED.includes(t.status))
    .filter(t => isToday(t.dueAt) || isOverdue(t.dueAt) || t.severity === 'critical')
    .slice()
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
});

// ==================== 区域二：阻塞来源 ====================
const blockedTasks = computed(() =>
  tasks.value.filter(t => t.status === 'blocked')
    .slice()
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
);

// 提取任务描述中被保留的阻塞说明（【...】片段）
function blockedNote(task: InspectionTask): string {
  const matches = task.description.match(/【[^】]*】/g);
  return matches && matches.length ? matches[matches.length - 1] : '来源缺失，任务已阻塞';
}

// ==================== 区域三：按故事任务分布 ====================
const storyDistribution = computed(() => {
  const map = new Map<string, { story: string; open: number; inProgress: number; blocked: number; resolved: number; total: number }>();
  tasks.value.forEach(t => {
    const key = t.story || '未分类';
    if (!map.has(key)) {
      map.set(key, { story: key, open: 0, inProgress: 0, blocked: 0, resolved: 0, total: 0 });
    }
    const row = map.get(key)!;
    row.total++;
    if (t.status === 'open') row.open++;
    else if (t.status === 'in_progress') row.inProgress++;
    else if (t.status === 'blocked') row.blocked++;
    else if (t.status === 'resolved') row.resolved++;
  });
  return Array.from(map.values()).sort((a, b) => (b.open + b.inProgress + b.blocked) - (a.open + a.inProgress + a.blocked));
});

const maxStoryUnresolved = computed(() =>
  Math.max(1, ...storyDistribution.value.map(s => s.open + s.inProgress + s.blocked))
);

// ==================== 任务清单：状态筛选 + 严重度排序 ====================
const filterStatus = ref<InspectionStatus | ''>('');
const filterStory = ref<string>('');

const allTaskStories = computed(() => {
  const set = new Set(tasks.value.map(t => t.story).filter(Boolean));
  return Array.from(set).sort();
});

const listedTasks = computed(() => {
  return tasks.value
    .filter(t => !filterStatus.value || t.status === filterStatus.value)
    .filter(t => !filterStory.value || t.story === filterStory.value)
    .slice()
    .sort((a, b) => {
      const aDone = a.status === 'resolved' || a.status === 'dismissed';
      const bDone = b.status === 'resolved' || b.status === 'dismissed';
      if (aDone !== bDone) return aDone ? 1 : -1;
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
});

function resetListFilters() {
  filterStatus.value = '';
  filterStory.value = '';
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

function goInspectionCenter() {
  router.push('/inspection');
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-rice-50">
    <TopBar />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <!-- 标题 -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <LayoutDashboard class="w-6 h-6 text-cinnabar-600" />
          <div>
            <h2 class="font-serif text-xl font-bold text-ink-800">演出检查工作台</h2>
            <p class="text-xs text-ink-500">角色风险 · 交接结论 · 排练进度 · 巡检任务 总览</p>
          </div>
        </div>
        <button class="btn-primary !py-1.5" @click="goInspectionCenter">
          <ListTodo class="w-4 h-4" />
          <span>巡检任务中心</span>
        </button>
      </div>

      <!-- 四类指标 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <!-- 角色风险 -->
        <button
          class="bg-white rounded-lg border border-ink-200 p-4 text-left hover:shadow-md transition-shadow"
          @click="router.push('/characters')"
        >
          <div class="flex items-center gap-2 mb-2">
            <Home class="w-5 h-5 text-cinnabar-600" />
            <span class="font-medium text-ink-700">角色风险</span>
            <ArrowUpRight class="w-4 h-4 text-ink-300 ml-auto" />
          </div>
          <div class="text-3xl font-bold text-ink-800 font-serif">{{ characterRisk.total }}</div>
          <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span class="text-orange-600">高风险 {{ characterRisk.high }}</span>
            <span class="text-red-600">缺件 {{ characterRisk.needParts }}</span>
            <span class="text-yellow-600">缺责任人 {{ characterRisk.noOwner }}</span>
          </div>
        </button>

        <!-- 交接结论 -->
        <button
          class="bg-white rounded-lg border border-ink-200 p-4 text-left hover:shadow-md transition-shadow"
          @click="router.push('/handover')"
        >
          <div class="flex items-center gap-2 mb-2">
            <ClipboardCheck class="w-5 h-5 text-cinnabar-600" />
            <span class="font-medium text-ink-700">交接结论</span>
            <ArrowUpRight class="w-4 h-4 text-ink-300 ml-auto" />
          </div>
          <div
            class="text-2xl font-bold font-serif"
            :class="handoverConclusion.level === 'has_risk' ? 'text-red-600' : handoverConclusion.level === 'follow_up' ? 'text-yellow-600' : 'text-bamboo-600'"
          >
            {{ handoverLevelText[handoverConclusion.level] }}
          </div>
          <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span class="text-red-600">风险 {{ handoverConclusion.hasRisk }}</span>
            <span class="text-yellow-600">跟进 {{ handoverConclusion.followUp }}</span>
            <span class="text-bamboo-600">可交接 {{ handoverConclusion.confirmed }}</span>
          </div>
        </button>

        <!-- 排练进度 -->
        <button
          class="bg-white rounded-lg border border-ink-200 p-4 text-left hover:shadow-md transition-shadow"
          @click="router.push('/rehearsal')"
        >
          <div class="flex items-center gap-2 mb-2">
            <Theater class="w-5 h-5 text-cinnabar-600" />
            <span class="font-medium text-ink-700">排练进度</span>
            <ArrowUpRight class="w-4 h-4 text-ink-300 ml-auto" />
          </div>
          <div class="text-3xl font-bold text-purple-700 font-serif">{{ rehearsalProgress.progress }}%</div>
          <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span>{{ rehearsalProgress.plans }} 个场次</span>
            <span class="text-orange-600">需复排 {{ rehearsalProgress.needRehearse }}</span>
            <span class="text-red-600">未通过 {{ rehearsalProgress.fail }}</span>
          </div>
        </button>

        <!-- 巡检任务 -->
        <button
          class="bg-white rounded-lg border border-ink-200 p-4 text-left hover:shadow-md transition-shadow"
          @click="goInspectionCenter"
        >
          <div class="flex items-center gap-2 mb-2">
            <ListTodo class="w-5 h-5 text-cinnabar-600" />
            <span class="font-medium text-ink-700">巡检任务</span>
            <ArrowUpRight class="w-4 h-4 text-ink-300 ml-auto" />
          </div>
          <div class="text-3xl font-bold text-cinnabar-700 font-serif">{{ taskMetric.unresolved }}</div>
          <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span class="text-sky-600">待处理 {{ taskMetric.open }}</span>
            <span class="text-indigo-600">处理中 {{ taskMetric.inProgress }}</span>
            <span class="text-rose-600">阻塞 {{ taskMetric.blocked }}</span>
          </div>
        </button>
      </div>

      <!-- 三个区域 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- 今日待处理 -->
        <div class="bg-white rounded-lg border border-ink-200 p-4 flex flex-col">
          <div class="flex items-center gap-2 mb-3">
            <CalendarClock class="w-5 h-5 text-cinnabar-600" />
            <h3 class="font-bold text-ink-800">今日待处理</h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-cinnabar-50 text-cinnabar-700 border border-cinnabar-200 ml-auto">
              {{ todayTasks.length }}
            </span>
          </div>
          <div v-if="todayTasks.length === 0" class="flex-1 flex flex-col items-center justify-center py-8 text-ink-400">
            <CheckCircle class="w-8 h-8 mb-2 opacity-40" />
            <p class="text-sm">今日无紧急待处理任务</p>
          </div>
          <ul v-else class="space-y-2 max-h-72 overflow-y-auto">
            <li
              v-for="task in todayTasks"
              :key="task.id"
              class="rounded-md border border-ink-100 p-2 hover:bg-rice-50 cursor-pointer"
              @click="jumpToSource(task)"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-[11px] px-1.5 py-0.5 rounded border', severityClass[task.severity]]">
                  {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
                </span>
                <span :class="['text-[11px] px-1.5 py-0.5 rounded border', statusClass[task.status]]">
                  {{ INSPECTION_STATUS_LABELS[task.status] }}
                </span>
                <span v-if="isOverdue(task.dueAt)" class="text-[11px] px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">已逾期</span>
                <span class="flex-1 min-w-0 truncate text-sm text-ink-700">{{ task.title }}</span>
              </div>
            </li>
          </ul>
        </div>

        <!-- 阻塞来源 -->
        <div class="bg-white rounded-lg border border-ink-200 p-4 flex flex-col">
          <div class="flex items-center gap-2 mb-3">
            <Ban class="w-5 h-5 text-rose-600" />
            <h3 class="font-bold text-ink-800">阻塞来源</h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 ml-auto">
              {{ blockedTasks.length }}
            </span>
          </div>
          <div v-if="blockedTasks.length === 0" class="flex-1 flex flex-col items-center justify-center py-8 text-ink-400">
            <CheckCircle class="w-8 h-8 mb-2 opacity-40" />
            <p class="text-sm">暂无阻塞任务</p>
          </div>
          <ul v-else class="space-y-2 max-h-72 overflow-y-auto">
            <li
              v-for="task in blockedTasks"
              :key="task.id"
              class="rounded-md border border-rose-100 bg-rose-50/40 p-2"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-[11px] px-1.5 py-0.5 rounded border', severityClass[task.severity]]">
                  {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
                </span>
                <span class="flex-1 min-w-0 truncate text-sm text-ink-700">{{ task.title }}</span>
              </div>
              <!-- 来源缺失：显示 blocked 状态与保留说明，来源仍在则可跳转 -->
              <div class="mt-1 flex items-center gap-2">
                <button
                  v-if="sourceExists(task)"
                  class="inline-flex items-center gap-1 text-[11px] text-cinnabar-600 hover:text-cinnabar-700"
                  @click="jumpToSource(task)"
                >
                  <ArrowUpRight class="w-3 h-3" />来源：{{ sourceLabel(task) }}
                </button>
                <span v-else class="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertOctagon class="w-3 h-3" />来源缺失（{{ INSPECTION_SOURCE_LABELS[task.sourceType] }} · {{ task.sourceId || '—' }}）
                </span>
              </div>
              <p class="mt-0.5 text-[11px] text-ink-500 break-words">{{ blockedNote(task) }}</p>
            </li>
          </ul>
        </div>

        <!-- 按故事任务分布 -->
        <div class="bg-white rounded-lg border border-ink-200 p-4 flex flex-col">
          <div class="flex items-center gap-2 mb-3">
            <PieChart class="w-5 h-5 text-cinnabar-600" />
            <h3 class="font-bold text-ink-800">按故事任务分布</h3>
          </div>
          <div v-if="storyDistribution.length === 0" class="flex-1 flex flex-col items-center justify-center py-8 text-ink-400">
            <p class="text-sm">暂无任务数据</p>
          </div>
          <ul v-else class="space-y-3 max-h-72 overflow-y-auto">
            <li v-for="row in storyDistribution" :key="row.story">
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="font-medium text-ink-700 truncate">{{ row.story }}</span>
                <span class="text-xs text-ink-400">未解决 {{ row.open + row.inProgress + row.blocked }} / 共 {{ row.total }}</span>
              </div>
              <div class="flex h-2.5 rounded-full overflow-hidden bg-ink-100">
                <div class="bg-sky-500" :style="{ width: (row.open / maxStoryUnresolved * 100) + '%' }" />
                <div class="bg-indigo-500" :style="{ width: (row.inProgress / maxStoryUnresolved * 100) + '%' }" />
                <div class="bg-rose-500" :style="{ width: (row.blocked / maxStoryUnresolved * 100) + '%' }" />
              </div>
              <div class="mt-0.5 flex gap-3 text-[11px] text-ink-500">
                <span class="text-sky-600">待处理 {{ row.open }}</span>
                <span class="text-indigo-600">处理中 {{ row.inProgress }}</span>
                <span class="text-rose-600">阻塞 {{ row.blocked }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- 任务清单（状态筛选 + 严重度排序 + 来源跳转 + 空态） -->
      <div class="bg-white rounded-lg border border-ink-200 p-4">
        <div class="flex flex-wrap items-center gap-3 mb-3">
          <div class="flex items-center gap-1.5 text-ink-700 font-medium">
            <ListTodo class="w-5 h-5 text-cinnabar-600" />任务清单
          </div>
          <div class="flex items-center gap-1.5 text-ink-500 text-sm ml-2">
            <Filter class="w-4 h-4" />筛选
          </div>
          <select v-model="filterStatus" class="input-base !py-1 !text-sm !w-auto">
            <option value="">全部状态</option>
            <option v-for="(label, key) in INSPECTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="filterStory" class="input-base !py-1 !text-sm !w-auto">
            <option value="">全部故事</option>
            <option v-for="s in allTaskStories" :key="s" :value="s">{{ s }}</option>
          </select>
          <button class="text-sm text-ink-500 hover:text-cinnabar-600 underline" @click="resetListFilters">重置</button>
          <span class="text-sm text-ink-400 ml-auto">共 {{ listedTasks.length }} 项（按严重度排序）</span>
        </div>

        <!-- 空态 -->
        <div v-if="listedTasks.length === 0" class="flex flex-col items-center justify-center py-12 text-ink-400">
          <ListTodo class="w-10 h-10 mb-2 opacity-30" />
          <p class="text-sm">
            {{ (filterStatus || filterStory) ? '当前筛选条件下暂无任务' : '暂无巡检任务，去角色清单或排练计划沉淀风险项吧' }}
          </p>
          <button
            v-if="filterStatus || filterStory"
            class="mt-3 btn-secondary !py-1 !px-3 text-sm"
            @click="resetListFilters"
          >
            清除筛选
          </button>
        </div>

        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div
            v-for="task in listedTasks"
            :key="task.id"
            class="rounded-lg border border-ink-100 p-3 hover:shadow-sm transition-shadow"
          >
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span :class="['text-[11px] px-1.5 py-0.5 rounded border', severityClass[task.severity]]">
                    {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
                  </span>
                  <span :class="['text-[11px] px-1.5 py-0.5 rounded border', statusClass[task.status]]">
                    {{ INSPECTION_STATUS_LABELS[task.status] }}
                  </span>
                  <span class="text-[11px] px-1.5 py-0.5 rounded border bg-rice-100 text-ink-600 border-ink-200">{{ task.story }}</span>
                </div>
                <h4 class="mt-1.5 text-sm font-medium text-ink-800 break-words">{{ task.title }}</h4>
              </div>
              <AlertTriangle v-if="task.severity === 'critical' || task.status === 'blocked'" class="w-4 h-4 text-red-500 shrink-0" />
            </div>
            <!-- 来源跳转 / 来源缺失回退 -->
            <div class="mt-2">
              <button
                v-if="sourceExists(task)"
                class="inline-flex items-center gap-1 text-[11px] text-cinnabar-600 hover:text-cinnabar-700 bg-cinnabar-50 border border-cinnabar-200 rounded px-2 py-1"
                @click="jumpToSource(task)"
              >
                <ArrowUpRight class="w-3 h-3" />来源：{{ sourceLabel(task) }}
              </button>
              <div v-else class="inline-flex items-center gap-1 text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                <AlertOctagon class="w-3 h-3" />
                来源缺失（{{ INSPECTION_SOURCE_LABELS[task.sourceType] }} · {{ task.sourceId || '—' }}）· 已阻塞
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flex justify-end">
          <button class="btn-secondary !py-1.5" @click="goInspectionCenter">
            <span>前往巡检任务中心</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    </main>

    <ToastContainer />
  </div>
</template>
