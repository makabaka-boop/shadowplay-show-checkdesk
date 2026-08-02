<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ListTodo,
  ChevronRight,
  AlertTriangle,
  Users,
  ClipboardCheck,
  Theater,
  Clock,
  Ban,
  ExternalLink,
  Link2,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import FilterPanel from '../components/FilterPanel.vue';
import CharacterTable from '../components/CharacterTable.vue';
import DetailPanel from '../components/DetailPanel.vue';
import CharacterModal from '../components/CharacterModal.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useDemoMode } from '../composables/useDemoMode';
import { useCharacters, onCharactersImported } from '../composables/useCharacters';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useToast } from '../composables/useToast';
import type { Character, InspectionTask, InspectionSeverity, InspectionStatus } from '../types';
import {
  INSPECTION_SOURCE_LABELS,
  INSPECTION_SEVERITY_LABELS,
  INSPECTION_STATUS_LABELS,
} from '../types';

const router = useRouter();
const { warning } = useToast();
const { characters, getCharacterById } = useCharacters();
const { rehearsalPlans, getPlanById, getPlanStats } = useRehearsalPlans();
const { tasks: inspectionTasks } = useInspectionTasks();

// ------- 四类指标：角色风险 / 交接结论 / 排练进度 / 巡检任务 -------
function hasObjectiveRisk(char: Character): boolean {
  const hasMissingParts = char.missingAccessories.some(a => a.available < a.required);
  const isHighRisk = char.riskLevel === 'high' || char.riskLevel === 'critical';
  return hasMissingParts || isHighRisk || !char.owner;
}

const charRiskStats = computed(() => ({
  highRisk: characters.value.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length,
  needParts: characters.value.filter(c => c.missingAccessories.some(a => a.available < a.required)).length,
  unassigned: characters.value.filter(c => !c.owner).length,
}));

const handoverSummary = computed(() => {
  const chars = characters.value;
  if (chars.length === 0) return null;
  const riskCount = chars.filter(c => hasObjectiveRisk(c) || c.handoverStatus === 'has_risk').length;
  const followCount = chars.filter(c =>
    !hasObjectiveRisk(c) && c.handoverStatus !== 'has_risk' &&
    (c.handoverStatus === 'follow_up' || c.handoverStatus === 'not_checked')
  ).length;
  if (riskCount > 0) {
    return { label: '存在风险', count: riskCount, text: 'text-red-700', bg: 'from-red-50 to-red-100/50 border-red-200', icon: 'text-red-600' };
  }
  if (followCount > 0) {
    return { label: '需跟进', count: followCount, text: 'text-yellow-700', bg: 'from-yellow-50 to-yellow-100/50 border-yellow-200', icon: 'text-yellow-600' };
  }
  return { label: '可交接', count: chars.length, text: 'text-bamboo-700', bg: 'from-bamboo-50 to-bamboo-100/50 border-bamboo-200', icon: 'text-bamboo-600' };
});

const rehearsalSummary = computed(() => {
  const active = rehearsalPlans.value.filter(p => p.status === 'scheduled' || p.status === 'in_progress');
  const avg = active.length > 0
    ? Math.round(active.reduce((sum, p) => sum + getPlanStats(p).progress, 0) / active.length)
    : 0;
  const next = [...active].sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))[0];
  return {
    activeCount: active.length,
    avgProgress: avg,
    nextName: next?.name || '',
    nextAt: next?.scheduledAt || '',
  };
});

function isUnresolved(task: InspectionTask): boolean {
  return task.status === 'open' || task.status === 'in_progress' || task.status === 'blocked';
}

const taskStats = computed(() => ({
  open: inspectionTasks.value.filter(t => t.status === 'open').length,
  in_progress: inspectionTasks.value.filter(t => t.status === 'in_progress').length,
  blocked: inspectionTasks.value.filter(t => t.status === 'blocked').length,
  critical: inspectionTasks.value.filter(t => t.severity === 'critical' && isUnresolved(t)).length,
}));

// ------- 今日待处理（严重度排序 + 状态筛选 + 空态） -------
const severityOrder: Record<InspectionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const todayFilter = ref<'all' | InspectionStatus>('all');

const todayTasks = computed(() => {
  let list = inspectionTasks.value.filter(isUnresolved);
  if (todayFilter.value !== 'all') {
    list = list.filter(t => t.status === todayFilter.value);
  }
  return list
    .sort((a, b) => {
      const s = severityOrder[a.severity] - severityOrder[b.severity];
      if (s !== 0) return s;
      return (a.dueAt || '9999').localeCompare(b.dueAt || '9999');
    })
    .slice(0, 6);
});

const blockedTasks = computed(() =>
  inspectionTasks.value
    .filter(t => t.status === 'blocked')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 5)
);

const storyDistribution = computed(() => {
  const map = new Map<string, { total: number; unresolved: number }>();
  inspectionTasks.value.forEach(t => {
    const entry = map.get(t.story) || { total: 0, unresolved: 0 };
    entry.total++;
    if (isUnresolved(t)) entry.unresolved++;
    map.set(t.story, entry);
  });
  const list = Array.from(map.entries())
    .map(([story, v]) => ({ story, ...v }))
    .sort((a, b) => b.unresolved - a.unresolved || b.total - a.total);
  const max = list.reduce((m, it) => Math.max(m, it.unresolved), 0);
  return list.map(it => ({ ...it, percent: max > 0 ? Math.round((it.unresolved / max) * 100) : 0 }));
});

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

function isOverdue(task: InspectionTask): boolean {
  if (!task.dueAt || task.status === 'resolved' || task.status === 'dismissed') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

function isDueToday(task: InspectionTask): boolean {
  if (!task.dueAt) return false;
  const d = new Date(task.dueAt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function formatDue(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ------- 来源跳转入口：找不到来源时保留 blocked 状态与说明 -------
function taskSourceAvailable(task: InspectionTask): boolean {
  if (task.sourceType === 'manual') return false;
  if (task.sourceType === 'rehearsal') return !!(task.planId && getPlanById(task.planId));
  if (task.characterId) return !!getCharacterById(task.characterId);
  return true;
}

const workspaceRef = ref<HTMLElement | null>(null);

function jumpTaskSource(task: InspectionTask) {
  if (!taskSourceAvailable(task)) {
    warning(`任务「${task.title}」的来源已缺失，保持阻塞状态并保留来源说明`);
    return;
  }
  if (task.sourceType === 'character') {
    if (task.characterId) {
      selectedId.value = task.characterId;
      workspaceRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (task.sourceType === 'handover') {
    router.push('/handover');
  } else if (task.sourceType === 'rehearsal') {
    router.push(`/rehearsal/${task.planId}`);
  }
}

// ------- 既有角色核对工作区 -------
const { demoCharacters } = useDemoMode();

const selectedId = ref<string | null>(null);
const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const visibleIds = computed(() => demoCharacters.value.map(c => c.id));

const selectedCharacter = computed<Character | null>(() => {
  if (!selectedId.value) return null;
  return demoCharacters.value.find(c => c.id === selectedId.value) ?? null;
});

function handleSelect(char: Character | null) {
  selectedId.value = char?.id ?? null;
}

function handleEdit(char: Character) {
  editingCharacter.value = char;
  showModal.value = true;
}

function openCreate() {
  editingCharacter.value = null;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingCharacter.value = null;
}

function handleSaved(char: Character) {
  selectedId.value = char.id;
}

function handleDataImported() {
  if (selectedId.value) {
    const found = demoCharacters.value.find(c => c.id === selectedId.value);
    if (!found) {
      selectedId.value = null;
    }
  }
}

onMounted(() => {
  onCharactersImported(() => {
    handleDataImported();
  });
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" @open-create="openCreate" @data-imported="handleDataImported" />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <!-- 四类指标总览 -->
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <button
          class="scroll-card p-3 sm:p-4 text-left hover:ring-2 hover:ring-orange-300 transition-all"
          @click="workspaceRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })"
        >
          <div class="flex items-center gap-2 mb-1">
            <Users class="w-4 h-4 text-orange-600" />
            <span class="text-xs text-ink-500">角色风险</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-orange-700 font-serif">{{ charRiskStats.highRisk }}</div>
          <div class="text-[11px] text-ink-500 mt-1">
            高风险角色 · 缺件 {{ charRiskStats.needParts }} · 未分配 {{ charRiskStats.unassigned }}
          </div>
        </button>

        <button
          v-if="handoverSummary"
          :class="['p-3 sm:p-4 text-left rounded-lg border bg-gradient-to-br hover:ring-2 hover:ring-cinnabar-300 transition-all', handoverSummary.bg]"
          @click="router.push('/handover')"
        >
          <div class="flex items-center gap-2 mb-1">
            <ClipboardCheck class="w-4 h-4" :class="handoverSummary.icon" />
            <span class="text-xs text-ink-500">交接结论</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold font-serif" :class="handoverSummary.text">
            {{ handoverSummary.label }}
          </div>
          <div class="text-[11px] text-ink-500 mt-1">{{ handoverSummary.count }} 个角色待处理交接</div>
        </button>

        <button
          class="scroll-card p-3 sm:p-4 text-left hover:ring-2 hover:ring-purple-300 transition-all"
          @click="router.push('/rehearsal')"
        >
          <div class="flex items-center gap-2 mb-1">
            <Theater class="w-4 h-4 text-purple-600" />
            <span class="text-xs text-ink-500">排练进度</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-purple-700 font-serif">{{ rehearsalSummary.avgProgress }}%</div>
          <div class="text-[11px] text-ink-500 mt-1 truncate">
            {{ rehearsalSummary.activeCount }} 场进行中/已排期<template v-if="rehearsalSummary.nextName"> · 最近：{{ rehearsalSummary.nextName }}</template>
          </div>
        </button>

        <button
          class="scroll-card p-3 sm:p-4 text-left hover:ring-2 hover:ring-blue-300 transition-all"
          @click="router.push('/tasks')"
        >
          <div class="flex items-center gap-2 mb-1">
            <ListTodo class="w-4 h-4 text-blue-600" />
            <span class="text-xs text-ink-500">巡检任务</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-blue-700 font-serif">
            {{ taskStats.open + taskStats.in_progress }}
          </div>
          <div class="text-[11px] text-ink-500 mt-1">
            待跟进 · 阻塞 {{ taskStats.blocked }} · 紧急 {{ taskStats.critical }}
          </div>
        </button>
      </section>

      <!-- 今日待处理 / 阻塞来源 / 按故事任务分布 -->
      <section class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="scroll-card p-4 flex flex-col">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <Clock class="w-5 h-5 text-cinnabar-600" />
            <h4 class="font-bold text-ink-800">今日待处理</h4>
            <div class="flex gap-1 ml-auto">
              <button
                v-for="opt in [
                  { key: 'all', label: '全部' },
                  { key: 'open', label: '待处理' },
                  { key: 'in_progress', label: '处理中' },
                  { key: 'blocked', label: '已阻塞' },
                ]"
                :key="opt.key"
                :class="[
                  'px-2 py-0.5 rounded text-xs font-medium transition-all border',
                  todayFilter === opt.key
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-500 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="todayFilter = opt.key as 'all' | InspectionStatus"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <div v-if="todayTasks.length === 0" class="text-sm text-ink-400 text-center py-6 bg-rice-50 rounded-md border border-rice-200 border-dashed">
            当前状态下暂无待处理任务
          </div>
          <div v-else class="space-y-2 flex-1">
            <div
              v-for="task in todayTasks"
              :key="task.id"
              class="flex flex-wrap items-center gap-2 p-2 rounded-md border bg-rice-50/70 border-rice-200"
            >
              <span :class="['tag border shrink-0', severityColors[task.severity]]">
                {{ INSPECTION_SEVERITY_LABELS[task.severity] }}
              </span>
              <button
                class="text-xs sm:text-sm font-medium text-ink-800 hover:text-cinnabar-700 hover:underline flex-1 min-w-0 truncate text-left"
                :title="INSPECTION_SOURCE_LABELS[task.sourceType]"
                @click="jumpTaskSource(task)"
              >
                {{ task.title }}
              </button>
              <span
                v-if="isOverdue(task)"
                class="tag border bg-red-50 text-red-600 border-red-200 shrink-0"
              >
                逾期 {{ formatDue(task.dueAt) }}
              </span>
              <span
                v-else-if="isDueToday(task)"
                class="tag border bg-orange-50 text-orange-600 border-orange-200 shrink-0"
              >
                今天截止
              </span>
              <span :class="['tag border shrink-0', statusColors[task.status]]">
                {{ INSPECTION_STATUS_LABELS[task.status] }}
              </span>
            </div>
          </div>
          <button
            class="btn-secondary !py-1 !px-2.5 text-xs mt-3 self-end"
            @click="router.push('/tasks')"
          >
            <ExternalLink class="w-3.5 h-3.5" />
            查看全部任务
          </button>
        </div>

        <div class="scroll-card p-4">
          <div class="flex items-center gap-2 mb-3">
            <Ban class="w-5 h-5 text-red-500" />
            <h4 class="font-bold text-ink-800">阻塞来源</h4>
            <span class="tag border bg-red-50 text-red-600 border-red-200 ml-auto">
              {{ blockedTasks.length }}
            </span>
          </div>
          <div v-if="blockedTasks.length === 0" class="text-sm text-ink-400 text-center py-6 bg-rice-50 rounded-md border border-rice-200 border-dashed">
            暂无阻塞任务
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="task in blockedTasks"
              :key="task.id"
              class="p-2 rounded-md border bg-red-50/60 border-red-100"
            >
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span class="tag border bg-rice-100 text-ink-600 border-rice-300 shrink-0">
                  {{ INSPECTION_SOURCE_LABELS[task.sourceType] }}
                </span>
                <span class="text-xs sm:text-sm font-medium text-ink-800 flex-1 min-w-0 truncate">{{ task.title }}</span>
                <span :class="['tag border shrink-0', statusColors[task.status]]">
                  {{ INSPECTION_STATUS_LABELS[task.status] }}
                </span>
                <button
                  v-if="taskSourceAvailable(task)"
                  class="text-xs text-cinnabar-600 hover:text-cinnabar-700 hover:underline font-medium inline-flex items-center gap-1"
                  @click="jumpTaskSource(task)"
                >
                  <ExternalLink class="w-3 h-3" />
                  跳转来源
                </button>
              </div>
              <p class="text-xs flex items-start gap-1" :class="taskSourceAvailable(task) ? 'text-ink-500' : 'text-red-500'">
                <Link2 class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span class="line-clamp-1">
                  {{ taskSourceAvailable(task) ? (task.description || '暂无说明') : `来源已缺失，保留来源信息待人工确认${task.description ? `：${task.description}` : ''}` }}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div class="scroll-card p-4">
          <div class="flex items-center gap-2 mb-3">
            <AlertTriangle class="w-5 h-5 text-gold-600" />
            <h4 class="font-bold text-ink-800">按故事任务分布</h4>
          </div>
          <div v-if="storyDistribution.length === 0" class="text-sm text-ink-400 text-center py-6 bg-rice-50 rounded-md border border-rice-200 border-dashed">
            暂无任务数据
          </div>
          <div v-else class="space-y-2">
            <button
              v-for="item in storyDistribution"
              :key="item.story"
              class="w-full text-left p-2 rounded-md border border-rice-200 hover:border-cinnabar-300 hover:bg-rice-50 transition-all"
              @click="router.push({ path: '/tasks', query: { story: item.story } })"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs sm:text-sm font-medium text-ink-800 flex-1 truncate">{{ item.story }}</span>
                <span class="text-xs text-ink-500 shrink-0">未解决 {{ item.unresolved }} / 共 {{ item.total }}</span>
                <ChevronRight class="w-3.5 h-3.5 text-ink-400 shrink-0" />
              </div>
              <div class="w-full h-1.5 bg-rice-200 rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-cinnabar-500 to-cinnabar-600 rounded-full transition-all duration-500"
                  :style="{ width: item.percent + '%' }"
                />
              </div>
            </button>
          </div>
        </div>
      </section>

      <FilterPanel />

      <div ref="workspaceRef" class="grid grid-cols-1 xl:grid-cols-5 gap-4" style="height: calc(100vh - 200px); min-height: 520px;">
        <div class="xl:col-span-3">
          <CharacterTable
            :selected-id="selectedId"
            @select="handleSelect"
            @edit="handleEdit"
          />
        </div>
        <div class="xl:col-span-2">
          <DetailPanel
            :character="selectedCharacter"
            @close="selectedId = null"
            @edit="handleEdit"
          />
        </div>
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
