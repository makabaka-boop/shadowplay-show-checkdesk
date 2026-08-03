<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ShieldAlert,
  ChevronRight,
  AlertOctagon,
  Clock,
  Users,
  ClipboardCheck,
  Theater,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  ExternalLink,
  Inbox,
  BarChart3,
  CalendarClock,
  Ban,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import FilterPanel from '../components/FilterPanel.vue';
import CharacterTable from '../components/CharacterTable.vue';
import DetailPanel from '../components/DetailPanel.vue';
import CharacterModal from '../components/CharacterModal.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useDemoMode } from '../composables/useDemoMode';
import { onCharactersImported } from '../composables/useCharacters';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useCharacters } from '../composables/useCharacters';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import type { Character, InspectionTask, InspectionTaskStatus, InspectionSeverity } from '../types';
import { INSPECTION_STATUS_LABELS, RISK_LABELS } from '../types';

const router = useRouter();
const selectedId = ref<string | null>(null);
const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const { demoCharacters } = useDemoMode();
const { characters } = useCharacters();
const { rehearsalPlans } = useRehearsalPlans();
const {
  tasks,
  openTaskCount,
  criticalTaskCount,
} = useInspectionTasks();

const visibleIds = computed(() => demoCharacters.value.map(c => c.id));

const selectedCharacter = computed<Character | null>(() => {
  if (!selectedId.value) return null;
  return demoCharacters.value.find(c => c.id === selectedId.value) ?? null;
});

const riskCharCount = computed(() =>
  characters.value.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length
);
const needPartsCount = computed(() =>
  characters.value.filter(c => c.missingAccessories.some(a => a.available < a.required)).length
);
const unassignedCount = computed(() =>
  characters.value.filter(c => !c.owner).length
);

const handoverRiskCount = computed(() =>
  characters.value.filter(c => {
    const missing = c.missingAccessories.some(a => a.available < a.required);
    const high = c.riskLevel === 'high' || c.riskLevel === 'critical';
    const noOwner = !c.owner;
    return missing || high || noOwner || c.handoverStatus === 'has_risk';
  }).length
);
const handoverConfirmedCount = computed(() =>
  characters.value.filter(c => c.handoverStatus === 'confirmed').length
);

const rehearsalActiveCount = computed(() =>
  rehearsalPlans.value.filter(p => p.status === 'in_progress' || p.status === 'scheduled').length
);
const rehearsalCompletedCount = computed(() =>
  rehearsalPlans.value.filter(p => p.status === 'completed').length
);

const blockedTasks = computed(() =>
  tasks.value.filter(t => t.status === 'blocked')
);

const todayTasks = computed(() => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const dueToday = tasks.value.filter(t =>
    t.status !== 'resolved' && t.status !== 'dismissed' &&
    t.dueAt && t.dueAt.slice(0, 10) === todayStr
  );
  const highPriority = tasks.value.filter(t =>
    (t.status === 'open' || t.status === 'in_progress') &&
    (t.severity === 'critical' || t.severity === 'high') &&
    !t.dueAt
  );
  const combined = [...dueToday, ...highPriority];
  const seen = new Set<string>();
  return combined.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).sort((a, b) => {
    const order: Record<InspectionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return order[b.severity] - order[a.severity];
  }).slice(0, 8);
});

type StoryStat = { story: string; total: number; open: number; inProgress: number; blocked: number; critical: number };
const storyDistribution = computed<StoryStat[]>(() => {
  const map = new Map<string, StoryStat>();
  tasks.value.forEach(t => {
    if (t.status === 'resolved' || t.status === 'dismissed') return;
    const key = t.story || '未分类';
    if (!map.has(key)) {
      map.set(key, { story: key, total: 0, open: 0, inProgress: 0, blocked: 0, critical: 0 });
    }
    const s = map.get(key)!;
    s.total++;
    if (t.status === 'open') s.open++;
    if (t.status === 'in_progress') s.inProgress++;
    if (t.status === 'blocked') s.blocked++;
    if (t.severity === 'critical') s.critical++;
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
});

const taskStatusFilter = ref<InspectionTaskStatus | ''>('');
const filteredDashboardTasks = computed(() => {
  let list = tasks.value.filter(
    t => t.status !== 'resolved' && t.status !== 'dismissed'
  );
  if (taskStatusFilter.value) {
    list = list.filter(t => t.status === taskStatusFilter.value);
  }
  const sevOrder: Record<InspectionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const statusOrder: Record<string, number> = { blocked: 0, in_progress: 1, open: 2 };
  return [...list].sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return sevOrder[b.severity] - sevOrder[a.severity];
  }).slice(0, 12);
});

function getCharName(charId: string): string {
  return characters.value.find(c => c.id === charId)?.name || '';
}

function getSourceLabel(task: InspectionTask): string {
  const labels: Record<string, string> = {
    character: '角色清单',
    handover: '交接核对',
    rehearsal: '排练计划',
    manual: '手工创建',
  };
  return labels[task.sourceType] || task.sourceType;
}

function getSourceIcon(task: InspectionTask) {
  switch (task.sourceType) {
    case 'character': return Users;
    case 'handover': return ClipboardCheck;
    case 'rehearsal': return Theater;
    default: return ShieldAlert;
  }
}

function navigateToTaskSource(task: InspectionTask) {
  switch (task.sourceType) {
    case 'character':
      if (task.characterId) {
        selectedId.value = task.characterId;
        router.push('/');
      } else {
        router.push('/');
      }
      break;
    case 'handover':
      router.push('/handover');
      break;
    case 'rehearsal':
      if (task.planId) {
        router.push(`/rehearsal/${task.planId}`);
      } else {
        router.push('/rehearsal');
      }
      break;
    default:
      router.push('/tasks');
  }
}

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
    if (!found) selectedId.value = null;
  }
}

onMounted(() => {
  onCharactersImported(() => handleDataImported());
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" @open-create="openCreate" @data-imported="handleDataImported" />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div class="scroll-card p-4 sm:p-5 bg-gradient-to-r from-cinnabar-50/60 to-rice-50">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="font-serif text-lg sm:text-xl font-bold text-cinnabar-800 flex items-center gap-2">
              <BarChart3 class="w-5 h-5" />
              演出检查工作台总览
            </h2>
            <p class="text-xs sm:text-sm text-ink-500 mt-0.5">
              集中查看角色风险、交接结论、排练进度与巡检任务，点击任务卡片可跳转至对应来源
            </p>
          </div>
          <button
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-cinnabar-700 text-white hover:bg-cinnabar-800 transition-colors"
            @click="router.push('/tasks')"
          >
            <ShieldAlert class="w-4 h-4" />
            打开任务中心
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="scroll-card p-4 cursor-pointer hover:shadow-md transition-all" @click="router.push('/')">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
              <AlertTriangle class="w-5 h-5 text-orange-600" />
            </div>
            <span class="text-xs text-ink-400">角色风险</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">{{ riskCharCount }}</div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-red-600">{{ needPartsCount }} 缺件</span>
            <span class="mx-1">·</span>
            <span class="text-yellow-600">{{ unassignedCount }} 未分配</span>
          </div>
        </div>

        <div class="scroll-card p-4 cursor-pointer hover:shadow-md transition-all" @click="router.push('/handover')">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <ClipboardCheck class="w-5 h-5 text-red-600" />
            </div>
            <span class="text-xs text-ink-400">交接结论</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">{{ handoverRiskCount }}</div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-bamboo-600">{{ handoverConfirmedCount }} 可交接</span>
            <span class="mx-1">·</span>
            <span class="text-red-600">{{ handoverRiskCount }} 有风险</span>
          </div>
        </div>

        <div class="scroll-card p-4 cursor-pointer hover:shadow-md transition-all" @click="router.push('/rehearsal')">
          <div class="flex items-center justify-between mb-2">
            <div class="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <Theater class="w-5 h-5 text-purple-600" />
            </div>
            <span class="text-xs text-ink-400">排练进度</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">{{ rehearsalActiveCount }}</div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-purple-600">{{ rehearsalActiveCount }} 进行中</span>
            <span class="mx-1">·</span>
            <span class="text-bamboo-600">{{ rehearsalCompletedCount }} 已完成</span>
          </div>
        </div>

        <div
          class="scroll-card p-4 cursor-pointer hover:shadow-md transition-all"
          :class="criticalTaskCount > 0 ? 'ring-2 ring-red-300' : 'ring-1 ring-gold-400/40'"
          @click="router.push('/tasks')"
        >
          <div class="flex items-center justify-between mb-2">
            <div
              :class="[
                'w-9 h-9 rounded-lg flex items-center justify-center',
                criticalTaskCount > 0 ? 'bg-red-100 text-red-600' : 'bg-gold-400/20 text-gold-600'
              ]"
            >
              <ShieldAlert class="w-5 h-5" />
            </div>
            <span class="text-xs text-ink-400">巡检任务</span>
          </div>
          <div class="text-2xl font-bold text-ink-800 font-serif">{{ openTaskCount }}</div>
          <div class="text-xs text-ink-500 mt-1 flex items-center gap-1 flex-wrap">
            <span v-if="criticalTaskCount > 0" class="text-red-600 flex items-center gap-0.5">
              <AlertOctagon class="w-3 h-3" /> {{ criticalTaskCount }} 紧急
            </span>
            <span v-if="blockedTasks.length > 0" class="text-orange-600 flex items-center gap-0.5">
              <Ban class="w-3 h-3" /> {{ blockedTasks.length }} 阻塞
            </span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="scroll-card p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-serif text-base font-bold text-ink-800 flex items-center gap-2">
              <CalendarClock class="w-4.5 h-4.5 text-cinnabar-600" />
              今日待处理
            </h3>
            <span class="text-xs text-ink-400">{{ todayTasks.length }} 项</span>
          </div>
          <div v-if="todayTasks.length === 0" class="text-center py-8 text-ink-400">
            <CheckCircle2 class="w-10 h-10 mx-auto mb-2 text-bamboo-300" />
            <p class="text-sm">暂无紧急或到期任务</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="task in todayTasks"
              :key="task.id"
              class="p-2.5 rounded-md border border-rice-200 bg-white hover:border-cinnabar-300 hover:bg-cinnabar-50/30 cursor-pointer transition-all"
              @click="navigateToTaskSource(task)"
            >
              <div class="flex items-start gap-2">
                <span
                  :class="[
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    task.severity === 'critical' ? 'bg-red-500' :
                    task.severity === 'high' ? 'bg-orange-500' :
                    task.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                  ]"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-sm font-medium text-ink-800 truncate">{{ task.title }}</span>
                    <span v-if="task.severity === 'critical'" class="tag border !py-0 !px-1.5 text-[10px] bg-red-50 text-red-700 border-red-200">紧急</span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5 text-[11px] text-ink-400">
                    <component :is="getSourceIcon(task)" class="w-3 h-3" />
                    <span>{{ getSourceLabel(task) }}</span>
                    <span v-if="getCharName(task.characterId)">· {{ getCharName(task.characterId) }}</span>
                  </div>
                </div>
                <ExternalLink class="w-3.5 h-3.5 text-ink-300 flex-shrink-0 mt-1" />
              </div>
            </div>
          </div>
        </div>

        <div class="scroll-card p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-serif text-base font-bold text-ink-800 flex items-center gap-2">
              <Ban class="w-4.5 h-4.5 text-red-600" />
              阻塞来源
            </h3>
            <span class="text-xs text-ink-400">{{ blockedTasks.length }} 项</span>
          </div>
          <div v-if="blockedTasks.length === 0" class="text-center py-8 text-ink-400">
            <CheckCircle2 class="w-10 h-10 mx-auto mb-2 text-bamboo-300" />
            <p class="text-sm">无阻塞任务</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="task in blockedTasks"
              :key="task.id"
              class="p-2.5 rounded-md border border-red-200 bg-red-50/50"
            >
              <div class="flex items-start gap-2">
                <Pause class="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-red-800 truncate">{{ task.title }}</div>
                  <p v-if="task.description" class="text-[11px] text-red-600/80 line-clamp-2 mt-0.5">{{ task.description }}</p>
                  <div class="flex items-center gap-2 mt-1 text-[11px] text-red-500/70">
                    <component :is="getSourceIcon(task)" class="w-3 h-3" />
                    <span>{{ getSourceLabel(task) }}</span>
                    <span v-if="!getCharName(task.characterId) && task.characterId" class="text-red-400">（角色已删除）</span>
                    <button
                      class="ml-auto inline-flex items-center gap-0.5 text-red-600 hover:text-red-800 transition-colors"
                      @click="navigateToTaskSource(task)"
                    >
                      查看 <ExternalLink class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="scroll-card p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-serif text-base font-bold text-ink-800 flex items-center gap-2">
              <BarChart3 class="w-4.5 h-4.5 text-cinnabar-600" />
              按故事任务分布
            </h3>
          </div>
          <div v-if="storyDistribution.length === 0" class="text-center py-8 text-ink-400">
            <Inbox class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-sm">暂无任务数据</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="stat in storyDistribution" :key="stat.story">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-ink-700">{{ stat.story }}</span>
                <span class="text-xs text-ink-500">{{ stat.total }} 项</span>
              </div>
              <div class="flex h-2 rounded-full overflow-hidden bg-rice-100">
                <div v-if="stat.blocked > 0" class="bg-red-500" :style="{ width: (stat.blocked / stat.total * 100) + '%' }" :title="`阻塞 ${stat.blocked}`" />
                <div v-if="stat.inProgress > 0" class="bg-cinnabar-500" :style="{ width: (stat.inProgress / stat.total * 100) + '%' }" :title="`处理中 ${stat.inProgress}`" />
                <div v-if="stat.open > 0" class="bg-blue-400" :style="{ width: (stat.open / stat.total * 100) + '%' }" :title="`待处理 ${stat.open}`" />
              </div>
              <div class="flex items-center gap-2 mt-0.5 text-[10px] text-ink-400">
                <span v-if="stat.blocked > 0" class="flex items-center gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-red-500" />阻塞 {{ stat.blocked }}</span>
                <span v-if="stat.inProgress > 0" class="flex items-center gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-cinnabar-500" />处理中 {{ stat.inProgress }}</span>
                <span v-if="stat.open > 0" class="flex items-center gap-0.5"><span class="w-1.5 h-1.5 rounded-full bg-blue-400" />待处理 {{ stat.open }}</span>
                <span v-if="stat.critical > 0" class="text-red-500 ml-auto">紧急 {{ stat.critical }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="scroll-card p-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-serif text-base font-bold text-ink-800 flex items-center gap-2">
            <ShieldAlert class="w-4.5 h-4.5 text-cinnabar-600" />
            巡检任务快览
          </h3>
          <div class="flex items-center gap-1.5">
            <button
              v-for="f in [{ v: '', l: '全部' }, { v: 'open', l: '待处理' }, { v: 'in_progress', l: '处理中' }, { v: 'blocked', l: '阻塞' }]"
              :key="f.v"
              :class="[
                'px-2 py-0.5 rounded text-xs font-medium transition-colors border',
                taskStatusFilter === f.v
                  ? 'bg-cinnabar-700 text-white border-cinnabar-700'
                  : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
              ]"
              @click="taskStatusFilter = (f.v as InspectionTaskStatus | '')"
            >
              {{ f.l }}
            </button>
          </div>
        </div>

        <div v-if="filteredDashboardTasks.length === 0" class="text-center py-10 text-ink-400">
          <Inbox class="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p class="text-sm">当前筛选条件下暂无任务</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <div
            v-for="task in filteredDashboardTasks"
            :key="task.id"
            class="p-3 rounded-md border bg-white hover:shadow-sm transition-all cursor-pointer group"
            :class="[
              task.status === 'blocked' ? 'border-red-200' :
              task.severity === 'critical' ? 'border-red-200 ring-1 ring-red-100' :
              'border-rice-200 hover:border-cinnabar-300'
            ]"
            @click="navigateToTaskSource(task)"
          >
            <div class="flex items-start gap-2">
              <span
                :class="[
                  'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  task.severity === 'critical' ? 'bg-red-500' :
                  task.severity === 'high' ? 'bg-orange-500' :
                  task.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                ]"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span class="text-sm font-semibold text-ink-800 truncate">{{ task.title }}</span>
                </div>
                <p v-if="task.description" class="text-xs text-ink-500 line-clamp-2 mb-1.5">{{ task.description }}</p>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span
                    :class="[
                      'tag border !py-0 !px-1.5 text-[10px]',
                      task.status === 'blocked' ? 'bg-red-50 text-red-700 border-red-200' :
                      task.status === 'in_progress' ? 'bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    ]"
                  >
                    <component :is="task.status === 'blocked' ? Pause : task.status === 'in_progress' ? Play : Clock" class="w-2.5 h-2.5 mr-0.5" />
                    {{ INSPECTION_STATUS_LABELS[task.status] }}
                  </span>
                  <span class="tag border !py-0 !px-1.5 text-[10px] bg-ink-50 text-ink-500 border-ink-200">
                    <component :is="getSourceIcon(task)" class="w-2.5 h-2.5 mr-0.5" />
                    {{ getSourceLabel(task) }}
                  </span>
                  <span v-if="task.severity === 'critical'" class="tag border !py-0 !px-1.5 text-[10px] bg-red-50 text-red-700 border-red-200">
                    {{ RISK_LABELS[task.severity] }}
                  </span>
                  <span v-if="getCharName(task.characterId)" class="text-[10px] text-ink-400">{{ getCharName(task.characterId) }}</span>
                  <ExternalLink class="w-3 h-3 text-ink-300 ml-auto group-hover:text-cinnabar-500 transition-colors" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FilterPanel />

      <div class="grid grid-cols-1 xl:grid-cols-5 gap-4" style="min-height: 480px;">
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
