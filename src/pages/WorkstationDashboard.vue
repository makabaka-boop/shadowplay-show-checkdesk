<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Users,
  PackageX,
  AlertTriangle,
  AlertOctagon,
  ClipboardCheck,
  Theater,
  Flag,
  CheckCircle,
  Clock,
  Ban,
  CalendarDays,
  ArrowRight,
  ExternalLink,
  User,
  Search,
  Filter,
  BookOpen,
  ClipboardList,
  Layers,
  AlertCircle,
  TrendingUp,
  CircleDot,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useCharacters } from '../composables/useCharacters';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useAutoCheck } from '../composables/useAutoCheck';
import type {
  Character,
  InspectionTask,
  TaskStatus,
  TaskSeverity,
  TaskSourceType,
} from '../types';
import {
  TASK_STATUS_LABELS,
  TASK_SEVERITY_LABELS,
  TASK_SOURCE_LABELS,
  RISK_LABELS,
  HANDOVER_LABELS,
} from '../types';

const router = useRouter();
const { characters, allStories } = useCharacters();
const { rehearsalPlans, getPlanStats } = useRehearsalPlans();
const {
  tasks,
  syncTasksFromCharacters,
  getStoryActiveTaskStats,
} = useInspectionTasks();
const { getUnresolvedTaskCount } = useAutoCheck();

onMounted(() => {
  syncTasksFromCharacters(characters.value, rehearsalPlans.value);
});

const statusFilter = ref<TaskStatus | ''>('');
const severityFilter = ref<TaskSeverity | ''>('');
const sourceFilter = ref<TaskSourceType | ''>('');
const searchQuery = ref('');

const characterStats = computed(() => {
  const total = characters.value.length;
  const needParts = characters.value.filter(c => c.missingAccessories.some(a => a.available < a.required)).length;
  const highRisk = characters.value.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length;
  const critical = characters.value.filter(c => c.riskLevel === 'critical').length;
  const unassigned = characters.value.filter(c => !c.owner).length;
  const ready = characters.value.filter(c => c.status === 'ready_to_pack' || c.status === 'completed').length;
  return { total, needParts, highRisk, critical, unassigned, ready };
});

function getObjectiveRisk(char: Character): boolean {
  const missing = char.missingAccessories.some(a => a.available < a.required);
  const high = char.riskLevel === 'high' || char.riskLevel === 'critical';
  const noOwner = !char.owner;
  return missing || high || noOwner;
}

const handoverStats = computed(() => {
  let confirmed = 0,
    followUp = 0,
    hasRisk = 0,
    notChecked = 0;
  characters.value.forEach(c => {
    if (getObjectiveRisk(c) || c.handoverStatus === 'has_risk') hasRisk++;
    else if (c.handoverStatus === 'confirmed') confirmed++;
    else if (c.handoverStatus === 'follow_up') followUp++;
    else notChecked++;
  });
  const ready = confirmed;
  const total = characters.value.length;
  return { confirmed, followUp, hasRisk, notChecked, ready, total };
});

const rehearsalStats = computed(() => {
  const plans = rehearsalPlans.value;
  const total = plans.length;
  let inProgress = 0,
    scheduled = 0,
    completed = 0,
    passChars = 0,
    failChars = 0,
    needRehearseChars = 0,
    totalChars = 0;
  plans.forEach(p => {
    if (p.status === 'in_progress') inProgress++;
    if (p.status === 'scheduled') scheduled++;
    if (p.status === 'completed') completed++;
    const stats = getPlanStats(p);
    passChars += stats.pass;
    failChars += stats.fail;
    needRehearseChars += stats.needRehearse;
    totalChars += stats.total;
  });
  const progress = totalChars > 0 ? Math.round(passChars / totalChars * 100) : 0;
  return { total, inProgress, scheduled, completed, passChars, failChars, needRehearseChars, totalChars, progress };
});

const taskStats = computed(() => {
  const list = tasks.value;
  const active = list.filter(t => t.status !== 'resolved' && t.status !== 'dismissed');
  const open = active.filter(t => t.status === 'open').length;
  const inProgress = active.filter(t => t.status === 'in_progress').length;
  const blocked = active.filter(t => t.status === 'blocked').length;
  const critical = active.filter(t => t.severity === 'critical').length;
  const high = active.filter(t => t.severity === 'high').length;
  const resolved = list.filter(t => t.status === 'resolved').length;
  return {
    total: list.length,
    active: active.length,
    open,
    inProgress,
    blocked,
    critical,
    high,
    resolved,
  };
});

const today = computed(() => {
  const now = Date.now();
  const end = now + 24 * 60 * 60 * 1000;
  return tasks.value
    .filter(t => {
      if (t.status === 'resolved' || t.status === 'dismissed') return false;
      if (!t.dueAt) return false;
      const d = new Date(t.dueAt).getTime();
      return !isNaN(d) && d <= end;
    })
    .sort((a, b) => {
      const sevOrder: Record<TaskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    });
});

const blockedTasks = computed(() =>
  tasks.value
    .filter(t => t.status === 'blocked')
    .sort((a, b) => {
      const sevOrder: Record<TaskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    })
);

const storyDistribution = computed(() => {
  const map = new Map<string, { story: string; total: number; open: number; inProgress: number; blocked: number; critical: number; high: number }>();
  allStories.value.forEach(s => {
    const stats = getStoryActiveTaskStats(s);
    map.set(s, {
      story: s,
      total: stats.total,
      open: stats.open,
      inProgress: stats.inProgress,
      blocked: stats.blocked,
      critical: stats.critical,
      high: stats.high,
    });
  });
  tasks.value.forEach(t => {
    if (!t.story) return;
    if (!map.has(t.story)) {
      const stats = getStoryActiveTaskStats(t.story);
      map.set(t.story, {
        story: t.story,
        total: stats.total,
        open: stats.open,
        inProgress: stats.inProgress,
        blocked: stats.blocked,
        critical: stats.critical,
        high: stats.high,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
});

const filteredTasks = computed(() => {
  const sevOrder: Record<TaskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const statusOrder: Record<TaskStatus, number> = { blocked: 0, open: 1, in_progress: 2, resolved: 4, dismissed: 5 };
  return tasks.value
    .filter(t => {
      if (statusFilter.value && t.status !== statusFilter.value) return false;
      if (severityFilter.value && t.severity !== severityFilter.value) return false;
      if (sourceFilter.value && t.sourceType !== sourceFilter.value) return false;
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          t.story.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return sevOrder[a.severity] - sevOrder[b.severity];
    });
});

function getSourceIcon(source: TaskSourceType) {
  switch (source) {
    case 'character':
      return BookOpen;
    case 'handover':
      return ClipboardCheck;
    case 'rehearsal':
      return Theater;
    default:
      return Flag;
  }
}

function canJump(task: InspectionTask): boolean {
  if (task.sourceType === 'manual') return false;
  if (task.sourceType === 'character' || task.sourceType === 'handover') return !!task.characterId;
  if (task.sourceType === 'rehearsal') return !!task.planId;
  return false;
}

function jumpToSource(task: InspectionTask) {
  if (!canJump(task)) return;
  if (task.sourceType === 'character' && task.characterId) {
    router.push({ path: '/characters', query: { character: task.characterId } });
  } else if (task.sourceType === 'handover' && task.characterId) {
    router.push({ path: '/handover', query: { character: task.characterId } });
  } else if (task.sourceType === 'rehearsal' && task.planId) {
    router.push(`/rehearsal/${task.planId}`);
  }
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

function formatDue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isOverdue(task: InspectionTask): boolean {
  if (!task.dueAt || task.status === 'resolved' || task.status === 'dismissed') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

const statusOptions: TaskStatus[] = ['open', 'in_progress', 'blocked', 'resolved', 'dismissed'];
const severityOptions: TaskSeverity[] = ['critical', 'high', 'medium', 'low'];
const sourceOptions: TaskSourceType[] = ['character', 'handover', 'rehearsal', 'manual'];

function clearFilters() {
  statusFilter.value = '';
  severityFilter.value = '';
  sourceFilter.value = '';
  searchQuery.value = '';
}

const hasActiveFilters = computed(
  () => statusFilter.value || severityFilter.value || sourceFilter.value || searchQuery.value
);
</script>

<template>
  <div class="min-h-screen flex flex-col bg-rice-50">
    <TopBar />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="font-serif text-2xl font-bold text-ink-800 flex items-center gap-2">
            <Layers class="w-6 h-6 text-cinnabar-700" />
            演出检查工作台
          </h2>
          <p class="text-sm text-ink-500 mt-1">集中掌握角色风险、交接结论、排练进度与巡检任务</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary !py-2" @click="router.push('/characters')">
            <Users class="w-4 h-4" />
            进入角色核对
          </button>
          <button class="btn-primary !py-2" @click="router.push('/inspection')">
            <Flag class="w-4 h-4" />
            巡检任务中心
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white rounded-lg border border-ink-200 p-4 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg bg-cinnabar-50 flex items-center justify-center">
              <Users class="w-5 h-5 text-cinnabar-700" />
            </div>
            <span class="text-[11px] text-ink-400">角色核对</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">{{ characterStats.total }}</div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-red-600 font-medium">{{ characterStats.needParts }} 缺件</span>
            <span class="mx-1.5 text-ink-300">·</span>
            <span class="text-orange-600 font-medium">{{ characterStats.highRisk }} 高/严重</span>
            <span class="mx-1.5 text-ink-300">·</span>
            <span class="text-yellow-600 font-medium">{{ characterStats.unassigned }} 未分配</span>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-ink-200 p-4 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <ClipboardCheck class="w-5 h-5 text-purple-600" />
            </div>
            <span class="text-[11px] text-ink-400">交接结论</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">
            {{ handoverStats.confirmed }}<span class="text-sm font-normal text-ink-400">/{{ handoverStats.total }}</span>
          </div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-green-600 font-medium">可交接 {{ handoverStats.confirmed }}</span>
            <span class="mx-1.5 text-ink-300">·</span>
            <span class="text-red-600 font-medium">风险 {{ handoverStats.hasRisk }}</span>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-ink-200 p-4 hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <Theater class="w-5 h-5 text-amber-600" />
            </div>
            <span class="text-[11px] text-ink-400">排练进度</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">{{ rehearsalStats.progress }}%</div>
          <div class="text-xs text-ink-500 mt-1">
            {{ rehearsalStats.total }} 场 ·
            <span class="text-green-600 font-medium">{{ rehearsalStats.passChars }} 通过</span>
            <span class="mx-1 text-ink-300">·</span>
            <span class="text-orange-600 font-medium">{{ rehearsalStats.needRehearseChars }} 复排</span>
            <span class="mx-1 text-ink-300">·</span>
            <span class="text-red-600 font-medium">{{ rehearsalStats.failChars }} 未过</span>
          </div>
        </div>

        <div class="bg-white rounded-lg border-2 p-4 hover:shadow-md transition-shadow" :class="taskStats.active > 0 ? 'border-cinnabar-300 bg-cinnabar-50/30' : 'border-bamboo-300 bg-bamboo-50/30'">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center" :class="taskStats.active > 0 ? 'bg-cinnabar-100' : 'bg-bamboo-100'">
              <Flag class="w-5 h-5" :class="taskStats.active > 0 ? 'text-cinnabar-700' : 'text-bamboo-700'" />
            </div>
            <span class="text-[11px] text-ink-400">巡检任务</span>
          </div>
          <div class="text-2xl font-bold font-serif" :class="taskStats.active > 0 ? 'text-cinnabar-700' : 'text-bamboo-700'">
            {{ taskStats.active }}
          </div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-blue-600 font-medium">待处理 {{ taskStats.open }}</span>
            <span class="mx-1 text-ink-300">·</span>
            <span class="text-amber-600 font-medium">进行中 {{ taskStats.inProgress }}</span>
            <span class="mx-1 text-ink-300">·</span>
            <span class="text-red-600 font-medium">阻塞 {{ taskStats.blocked }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="bg-white rounded-lg border border-ink-200 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-gradient-to-r from-blue-50/50 to-white">
            <div class="flex items-center gap-2">
              <CalendarDays class="w-4 h-4 text-blue-600" />
              <h3 class="font-bold text-ink-800">今日待处理</h3>
            </div>
            <router-link to="/inspection" class="text-xs text-cinnabar-700 hover:text-cinnabar-800 font-medium inline-flex items-center gap-0.5">
              全部 <ArrowRight class="w-3 h-3" />
            </router-link>
          </div>
          <div class="p-3 max-h-96 overflow-y-auto">
            <div v-if="today.length === 0" class="text-center py-10 text-ink-400">
              <CheckCircle class="w-10 h-10 mx-auto mb-2 text-bamboo-400/60" />
              <p class="text-sm">今日暂无截止任务</p>
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="task in today"
                :key="task.id"
                class="p-2.5 rounded-md border bg-white hover:shadow-sm transition-shadow cursor-pointer"
                :class="[
                  task.status === 'blocked' ? 'border-red-200 bg-red-50/30' : 'border-ink-200',
                  isOverdue(task) ? 'ring-1 ring-red-300' : '',
                ]"
                @click="canJump(task) && jumpToSource(task)"
              >
                <div class="flex items-start gap-2">
                  <component
                    :is="getSourceIcon(task.sourceType)"
                    class="w-4 h-4 flex-shrink-0 mt-0.5"
                    :class="task.severity === 'critical' ? 'text-red-600' : task.severity === 'high' ? 'text-orange-600' : 'text-ink-400'"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 flex-wrap mb-0.5">
                      <span class="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium border" :class="getSeverityClass(task.severity)">
                        {{ TASK_SEVERITY_LABELS[task.severity] }}
                      </span>
                      <span class="text-[10px] text-ink-400">{{ TASK_SOURCE_LABELS[task.sourceType] }}</span>
                    </div>
                    <div class="text-sm font-medium text-ink-800 leading-snug line-clamp-2">{{ task.title }}</div>
                    <div class="flex items-center gap-2 mt-1 text-[11px]">
                      <span v-if="task.assignee" class="inline-flex items-center gap-0.5 text-ink-500">
                        <User class="w-3 h-3" />{{ task.assignee }}
                      </span>
                      <span
                        class="inline-flex items-center gap-0.5"
                        :class="isOverdue(task) ? 'text-red-600 font-bold' : 'text-ink-400'"
                      >
                        <Clock class="w-3 h-3" />{{ formatDue(task.dueAt) }}
                      </span>
                      <span v-if="canJump(task)" class="ml-auto inline-flex items-center gap-0.5 text-cinnabar-600">
                        <ExternalLink class="w-3 h-3" />跳转
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-ink-200 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-gradient-to-r from-red-50/50 to-white">
            <div class="flex items-center gap-2">
              <Ban class="w-4 h-4 text-red-600" />
              <h3 class="font-bold text-ink-800">阻塞来源</h3>
              <span v-if="blockedTasks.length > 0" class="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                {{ blockedTasks.length }}
              </span>
            </div>
            <router-link to="/inspection?status=blocked" class="text-xs text-cinnabar-700 hover:text-cinnabar-800 font-medium inline-flex items-center gap-0.5">
              处理 <ArrowRight class="w-3 h-3" />
            </router-link>
          </div>
          <div class="p-3 max-h-96 overflow-y-auto">
            <div v-if="blockedTasks.length === 0" class="text-center py-10 text-ink-400">
              <CheckCircle class="w-10 h-10 mx-auto mb-2 text-bamboo-400/60" />
              <p class="text-sm">没有被阻塞的任务</p>
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="task in blockedTasks"
                :key="task.id"
                class="p-2.5 rounded-md border border-red-200 bg-red-50/40 hover:shadow-sm transition-shadow cursor-pointer"
                @click="canJump(task) && jumpToSource(task)"
              >
                <div class="flex items-start gap-2">
                  <Ban class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 flex-wrap mb-0.5">
                      <span class="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium border" :class="getSeverityClass(task.severity)">
                        {{ TASK_SEVERITY_LABELS[task.severity] }}
                      </span>
                      <span class="text-[10px] text-ink-400">{{ TASK_SOURCE_LABELS[task.sourceType] }}</span>
                      <span class="text-[10px] text-ink-400">· {{ task.story }}</span>
                    </div>
                    <div class="text-sm font-medium text-ink-800 leading-snug line-clamp-2">{{ task.title }}</div>
                    <div v-if="task.description" class="text-xs text-red-600/80 mt-1 line-clamp-2 whitespace-pre-wrap">{{ task.description }}</div>
                    <div class="flex items-center gap-2 mt-1 text-[11px] text-ink-500">
                      <span v-if="!canJump(task)" class="inline-flex items-center gap-0.5 text-red-600">
                        <AlertCircle class="w-3 h-3" />来源已不可访问，保留信息
                      </span>
                      <span v-else class="ml-auto inline-flex items-center gap-0.5 text-cinnabar-600">
                        <ExternalLink class="w-3 h-3" />查看来源
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg border border-ink-200 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-gradient-to-r from-cinnabar-50/50 to-white">
            <div class="flex items-center gap-2">
              <BookOpen class="w-4 h-4 text-cinnabar-700" />
              <h3 class="font-bold text-ink-800">按故事任务分布</h3>
            </div>
          </div>
          <div class="p-3 max-h-96 overflow-y-auto">
            <div v-if="storyDistribution.length === 0" class="text-center py-10 text-ink-400">
              <BookOpen class="w-10 h-10 mx-auto mb-2 text-ink-300" />
              <p class="text-sm">暂无任务数据</p>
            </div>
            <div v-else class="space-y-2.5">
              <div
                v-for="row in storyDistribution"
                :key="row.story"
                class="p-2.5 rounded-md border border-ink-100 hover:border-cinnabar-200 hover:bg-cinnabar-50/30 transition-colors cursor-pointer"
                @click="router.push({ path: '/inspection', query: { story: row.story } })"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-sm font-semibold text-ink-800 truncate">{{ row.story }}</span>
                  <span class="text-xs font-bold" :class="row.total > 0 ? 'text-cinnabar-700' : 'text-bamboo-600'">
                    {{ row.total }}
                  </span>
                </div>
                <div class="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden flex">
                  <div v-if="row.blocked > 0" class="h-full bg-red-500" :style="{ width: (row.total ? (row.blocked / row.total) * 100 : 0) + '%' }" />
                  <div v-if="row.open > 0" class="h-full bg-blue-500" :style="{ width: (row.total ? (row.open / row.total) * 100 : 0) + '%' }" />
                  <div v-if="row.inProgress > 0" class="h-full bg-amber-500" :style="{ width: (row.total ? (row.inProgress / row.total) * 100 : 0) + '%' }" />
                </div>
                <div class="flex items-center gap-2 mt-1 text-[10px] text-ink-500">
                  <span v-if="row.blocked > 0" class="inline-flex items-center gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-red-500" />阻塞 {{ row.blocked }}</span>
                  <span v-if="row.open > 0" class="inline-flex items-center gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-blue-500" />待处理 {{ row.open }}</span>
                  <span v-if="row.inProgress > 0" class="inline-flex items-center gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-500" />进行中 {{ row.inProgress }}</span>
                  <span v-if="row.critical + row.high > 0" class="ml-auto text-orange-600 font-medium">高/严重 {{ row.critical + row.high }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg border border-ink-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-ink-100 flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <ClipboardList class="w-4 h-4 text-cinnabar-700" />
            <h3 class="font-bold text-ink-800">巡检任务总览</h3>
            <span class="text-xs text-ink-400">共 {{ filteredTasks.length }} 条</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 ml-auto">
            <div class="relative">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索任务..."
                class="pl-8 pr-3 py-1.5 text-xs border border-ink-200 rounded-md focus:outline-none focus:ring-2 focus:ring-cinnabar-500/30 focus:border-cinnabar-500 w-44"
              />
            </div>
            <select v-model="statusFilter" class="px-2 py-1.5 text-xs border border-ink-200 rounded-md bg-white focus:outline-none">
              <option value="">全部状态</option>
              <option v-for="s in statusOptions" :key="s" :value="s">{{ TASK_STATUS_LABELS[s] }}</option>
            </select>
            <select v-model="severityFilter" class="px-2 py-1.5 text-xs border border-ink-200 rounded-md bg-white focus:outline-none">
              <option value="">全部严重度</option>
              <option v-for="s in severityOptions" :key="s" :value="s">{{ TASK_SEVERITY_LABELS[s] }}</option>
            </select>
            <select v-model="sourceFilter" class="px-2 py-1.5 text-xs border border-ink-200 rounded-md bg-white focus:outline-none">
              <option value="">全部来源</option>
              <option v-for="s in sourceOptions" :key="s" :value="s">{{ TASK_SOURCE_LABELS[s] }}</option>
            </select>
            <button
              v-if="hasActiveFilters"
              class="px-2 py-1.5 text-xs text-ink-500 hover:text-ink-700 inline-flex items-center gap-1"
              @click="clearFilters"
            >
              清除
            </button>
          </div>
        </div>

        <div v-if="filteredTasks.length === 0" class="p-12 text-center text-ink-400">
          <CheckCircle class="w-12 h-12 mx-auto mb-3 text-bamboo-400/50" />
          <p class="text-sm font-medium text-ink-500">没有符合条件的任务</p>
          <p class="text-xs mt-1">尝试调整筛选条件，或前往角色/交接/排练页面触发自动同步</p>
          <button class="btn-primary !py-1.5 mt-4 text-xs" @click="router.push('/inspection')">
            <Flag class="w-3.5 h-3.5" />
            打开巡检任务中心
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-rice-50 text-ink-500 text-xs">
              <tr>
                <th class="text-left font-medium px-4 py-2.5">严重度</th>
                <th class="text-left font-medium px-4 py-2.5">任务</th>
                <th class="text-left font-medium px-4 py-2.5">来源</th>
                <th class="text-left font-medium px-4 py-2.5">故事</th>
                <th class="text-left font-medium px-4 py-2.5">状态</th>
                <th class="text-left font-medium px-4 py-2.5">负责人</th>
                <th class="text-left font-medium px-4 py-2.5">截止</th>
                <th class="text-right font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr
                v-for="task in filteredTasks"
                :key="task.id"
                class="hover:bg-rice-50/50 transition-colors"
                :class="{ 'opacity-60': task.status === 'resolved' || task.status === 'dismissed' }"
              >
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border" :class="getSeverityClass(task.severity)">
                    <AlertTriangle v-if="task.severity === 'critical' || task.severity === 'high'" class="w-2.5 h-2.5 mr-0.5" />
                    {{ TASK_SEVERITY_LABELS[task.severity] }}
                  </span>
                </td>
                <td class="px-4 py-2.5 max-w-xs">
                  <div class="font-medium text-ink-800 leading-snug" :class="{ 'line-through text-ink-400': task.status === 'resolved' || task.status === 'dismissed' }">
                    {{ task.title }}
                  </div>
                  <div v-if="task.description" class="text-xs text-ink-400 line-clamp-1 mt-0.5">{{ task.description }}</div>
                </td>
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center gap-1 text-xs text-ink-600">
                    <component :is="getSourceIcon(task.sourceType)" class="w-3 h-3" />
                    {{ TASK_SOURCE_LABELS[task.sourceType] }}
                  </span>
                </td>
                <td class="px-4 py-2.5 text-xs text-ink-600">{{ task.story }}</td>
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border" :class="getStatusClass(task.status)">
                    <CircleDot v-if="task.status === 'open'" class="w-2.5 h-2.5" />
                    <Clock v-else-if="task.status === 'in_progress'" class="w-2.5 h-2.5" />
                    <Ban v-else-if="task.status === 'blocked'" class="w-2.5 h-2.5" />
                    <CheckCircle v-else-if="task.status === 'resolved'" class="w-2.5 h-2.5" />
                    {{ TASK_STATUS_LABELS[task.status] }}
                  </span>
                </td>
                <td class="px-4 py-2.5 text-xs text-ink-600">
                  <span v-if="task.assignee" class="inline-flex items-center gap-0.5"><User class="w-3 h-3" />{{ task.assignee }}</span>
                  <span v-else class="text-ink-300">—</span>
                </td>
                <td class="px-4 py-2.5 text-xs" :class="isOverdue(task) ? 'text-red-600 font-bold' : 'text-ink-500'">
                  {{ task.dueAt ? formatDue(task.dueAt) : '—' }}
                </td>
                <td class="px-4 py-2.5 text-right">
                  <button
                    v-if="canJump(task)"
                    class="inline-flex items-center gap-0.5 text-xs text-cinnabar-700 hover:text-cinnabar-800 font-medium"
                    @click="jumpToSource(task)"
                  >
                    <ExternalLink class="w-3 h-3" />
                    查看来源
                  </button>
                  <span v-else-if="task.status === 'blocked'" class="text-xs text-red-500 inline-flex items-center gap-0.5">
                    <AlertCircle class="w-3 h-3" />来源缺失
                  </span>
                  <span v-else class="text-xs text-ink-300">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <ToastContainer />
  </div>
</template>
