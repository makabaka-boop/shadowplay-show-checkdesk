<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChevronLeft,
  Plus,
  Calendar,
  MapPin,
  User,
  Users,
  Play,
  Check,
  X,
  Edit3,
  Trash2,
  Eye,
  Clock,
  AlertCircle,
  ClipboardList,
  Filter,
  Search,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import RehearsalPlanModal from '../components/RehearsalPlanModal.vue';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useToast } from '../composables/useToast';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useCharacters } from '../composables/useCharacters';
import type { RehearsalPlan, RehearsalStatus } from '../types';
import { REHEARSAL_STATUS_LABELS } from '../types';
import { onMounted } from 'vue';

const router = useRouter();
const { rehearsalPlans, deletePlan, getPlanStats, updatePlan } = useRehearsalPlans();
const { characters, allStories } = useCharacters();
const { success, warning, error } = useToast();
const { clearSelection } = useBatchOperations();

const showModal = ref(false);
const editingPlan = ref<RehearsalPlan | null>(null);
const filterStory = ref<string>('');
const filterStatus = ref<RehearsalStatus | ''>('');
const searchKeyword = ref('');

const visibleIds = computed(() => filteredPlans.value.map(p => p.id));

onMounted(() => {
  clearSelection();
});

const filteredPlans = computed(() => {
  let plans = [...rehearsalPlans.value].sort((a, b) => {
    const timeA = new Date(a.scheduledAt).getTime();
    const timeB = new Date(b.scheduledAt).getTime();
    return timeA - timeB;
  });

  if (filterStory.value) {
    plans = plans.filter(p => p.story === filterStory.value);
  }

  if (filterStatus.value) {
    plans = plans.filter(p => p.status === filterStatus.value);
  }

  if (searchKeyword.value.trim()) {
    const q = searchKeyword.value.trim().toLowerCase();
    plans = plans.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.venue.toLowerCase().includes(q) ||
      p.owner.toLowerCase().includes(q)
    );
  }

  return plans;
});

const stats = computed(() => {
  const total = rehearsalPlans.value.length;
  const draft = rehearsalPlans.value.filter(p => p.status === 'draft').length;
  const scheduled = rehearsalPlans.value.filter(p => p.status === 'scheduled').length;
  const inProgress = rehearsalPlans.value.filter(p => p.status === 'in_progress').length;
  const completed = rehearsalPlans.value.filter(p => p.status === 'completed').length;
  return { total, draft, scheduled, inProgress, completed };
});

const statusColors: Record<RehearsalStatus, string> = {
  draft: 'bg-gray-50 text-gray-600 border-gray-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const statusDotColors: Record<RehearsalStatus, string> = {
  draft: 'bg-gray-400',
  scheduled: 'bg-blue-500',
  in_progress: 'bg-purple-500',
  completed: 'bg-bamboo-500',
  cancelled: 'bg-red-500',
};

function formatDateTime(str: string): string {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  
  const prefix = isToday ? '今天 ' : isTomorrow ? '明天 ' : isYesterday ? '昨天 ' : '';
  const dateStr = isToday || isTomorrow || isYesterday ? '' : `${d.getMonth() + 1}月${d.getDate()}日 `;
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  
  return prefix + dateStr + timeStr;
}

function goBack() {
  window.history.back();
}

function openCreate() {
  editingPlan.value = null;
  showModal.value = true;
}

function openEdit(plan: RehearsalPlan) {
  editingPlan.value = plan;
  showModal.value = true;
}

function goDetail(plan: RehearsalPlan) {
  router.push(`/rehearsal/${plan.id}`);
}

function handleDelete(plan: RehearsalPlan) {
  if (!confirm(`确定删除排练场次「${plan.name}」吗？此操作不可撤销。`)) return;
  if (deletePlan(plan.id)) {
    success(`已删除「${plan.name}」`);
  } else {
    error('删除失败');
  }
}

function quickChangeStatus(plan: RehearsalPlan, status: RehearsalStatus) {
  updatePlan(plan.id, { status });
  success(`「${plan.name}」已标记为「${REHEARSAL_STATUS_LABELS[status]}」`);
}

function countCharactersInStory(story: string): number {
  return characters.value.filter(c => c.story === story).length;
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button class="btn-secondary !py-1.5 !px-2.5" @click="goBack">
            <ChevronLeft class="w-4 h-4" />
            <span class="hidden sm:inline">返回</span>
          </button>
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800">演出排练计划</h2>
          <span class="tag border bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200">
            <ClipboardList class="w-3 h-3 mr-1" />
            排练编排
          </span>
        </div>
        <button class="btn-primary !py-1.5" @click="openCreate">
          <Plus class="w-4 h-4" />
          <span class="hidden sm:inline">新建场次</span>
          <span class="sm:hidden">新建</span>
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <div class="bg-gradient-to-br from-ink-50 to-ink-100/50 rounded-lg p-3 sm:p-4 border border-ink-200">
          <div class="flex items-center gap-2 mb-1">
            <ClipboardList class="w-4 h-4 sm:w-5 sm:h-5 text-ink-600" />
            <span class="text-xs text-ink-500">总场次</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-ink-800 font-serif">{{ stats.total }}</div>
        </div>
        <div class="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg p-3 sm:p-4 border border-gray-200">
          <div class="flex items-center gap-2 mb-1">
            <AlertCircle class="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            <span class="text-xs text-gray-500">草稿</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-gray-700 font-serif">{{ stats.draft }}</div>
        </div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 sm:p-4 border border-blue-200">
          <div class="flex items-center gap-2 mb-1">
            <Calendar class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <span class="text-xs text-blue-500">已排期</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-blue-700 font-serif">{{ stats.scheduled }}</div>
        </div>
        <div class="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-3 sm:p-4 border border-purple-200">
          <div class="flex items-center gap-2 mb-1">
            <Play class="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            <span class="text-xs text-purple-500">进行中</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-purple-700 font-serif">{{ stats.inProgress }}</div>
        </div>
        <div class="bg-gradient-to-br from-bamboo-50 to-bamboo-100/50 rounded-lg p-3 sm:p-4 border border-bamboo-200 col-span-2 sm:col-span-1">
          <div class="flex items-center gap-2 mb-1">
            <Check class="w-4 h-4 sm:w-5 sm:h-5 text-bamboo-600" />
            <span class="text-xs text-bamboo-500">已完成</span>
          </div>
          <div class="text-2xl sm:text-3xl font-bold text-bamboo-700 font-serif">{{ stats.completed }}</div>
        </div>
      </div>

      <div class="scroll-card p-3 sm:p-4">
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <div class="relative flex-1 min-w-[200px] max-w-md">
            <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              v-model="searchKeyword"
              class="input-base pl-9"
              placeholder="搜索场次名称、场地、责任人..."
            />
          </div>
          <div class="flex items-center gap-1.5 text-sm text-ink-600">
            <Filter class="w-4 h-4" />
            <span>筛选:</span>
          </div>
          <select v-model="filterStory" class="select-base !w-auto">
            <option value="">全部故事</option>
            <option v-for="story in allStories" :key="story" :value="story">{{ story }}</option>
          </select>
          <select v-model="filterStatus" class="select-base !w-auto">
            <option value="">全部状态</option>
            <option v-for="(label, key) in REHEARSAL_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
      </div>

      <div v-if="filteredPlans.length === 0" class="scroll-card p-12 text-center text-ink-400">
        <ClipboardList class="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p class="text-sm">暂无排练场次</p>
        <button class="btn-primary mt-4" @click="openCreate">
          <Plus class="w-4 h-4" />
          创建第一个场次
        </button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="plan in filteredPlans"
          :key="plan.id"
          :class="[
            'scroll-card p-4 sm:p-5 transition-all hover:shadow-lg cursor-pointer group',
            plan.status === 'in_progress' ? 'ring-2 ring-purple-300' : '',
            plan.status === 'completed' ? 'ring-1 ring-bamboo-300' : '',
          ]"
          @click="goDetail(plan)"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span :class="['w-2.5 h-2.5 rounded-full flex-shrink-0', statusDotColors[plan.status]]" />
                <h3 class="font-serif text-base sm:text-lg font-bold text-ink-800 truncate group-hover:text-cinnabar-700 transition-colors">
                  {{ plan.name }}
                </h3>
              </div>
              <span :class="['tag border shrink-0', statusColors[plan.status]]">
                {{ REHEARSAL_STATUS_LABELS[plan.status] }}
              </span>
            </div>
            <div class="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="p-1.5 rounded hover:bg-ink-100 text-ink-500 hover:text-ink-700"
                title="查看详情"
                @click.stop="goDetail(plan)"
              >
                <Eye class="w-4 h-4" />
              </button>
              <button
                class="p-1.5 rounded hover:bg-ink-100 text-ink-500 hover:text-cinnabar-700"
                title="编辑"
                @click.stop="openEdit(plan)"
              >
                <Edit3 class="w-4 h-4" />
              </button>
              <button
                class="p-1.5 rounded hover:bg-red-50 text-ink-500 hover:text-red-600"
                title="删除"
                @click.stop="handleDelete(plan)"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="space-y-2 mb-4">
            <div class="flex items-center gap-2 text-sm text-ink-600">
              <Calendar class="w-4 h-4 text-ink-400 flex-shrink-0" />
              <span class="font-medium">{{ formatDateTime(plan.scheduledAt) }}</span>
            </div>
            <div v-if="plan.venue" class="flex items-center gap-2 text-sm text-ink-600">
              <MapPin class="w-4 h-4 text-ink-400 flex-shrink-0" />
              <span>{{ plan.venue }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-ink-600">
              <User class="w-4 h-4 text-ink-400 flex-shrink-0" />
              <span v-if="plan.owner">{{ plan.owner }}</span>
              <span v-else class="text-red-500">未指定责任人</span>
            </div>
          </div>

          <div class="flex items-center justify-between text-sm py-2 border-t border-rice-200">
            <div class="flex items-center gap-1.5 text-ink-500">
              <Users class="w-4 h-4" />
              <span>{{ getPlanStats(plan).total }} / {{ countCharactersInStory(plan.story) }} 角色</span>
            </div>
            <div class="flex-1 mx-3">
              <div class="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500"
                  :style="{ width: getPlanStats(plan).progress + '%' }"
                />
              </div>
            </div>
            <span class="font-medium text-ink-600">{{ getPlanStats(plan).progress }}%</span>
          </div>

          <div class="grid grid-cols-5 gap-1 mt-3 text-center">
            <div class="bg-ink-50 rounded py-1.5">
              <div class="text-lg font-bold text-ink-700">{{ getPlanStats(plan).total }}</div>
              <div class="text-[10px] text-ink-500">总数</div>
            </div>
            <div class="bg-bamboo-50 rounded py-1.5">
              <div class="text-lg font-bold text-bamboo-700">{{ getPlanStats(plan).pass }}</div>
              <div class="text-[10px] text-bamboo-600">通过</div>
            </div>
            <div class="bg-orange-50 rounded py-1.5">
              <div class="text-lg font-bold text-orange-700">{{ getPlanStats(plan).needRehearse }}</div>
              <div class="text-[10px] text-orange-600">复排</div>
            </div>
            <div class="bg-red-50 rounded py-1.5">
              <div class="text-lg font-bold text-red-700">{{ getPlanStats(plan).fail }}</div>
              <div class="text-[10px] text-red-600">未过</div>
            </div>
            <div class="bg-ink-50 rounded py-1.5">
              <div class="text-lg font-bold text-ink-600">{{ getPlanStats(plan).notStarted }}</div>
              <div class="text-[10px] text-ink-500">未开始</div>
            </div>
          </div>

          <div v-if="plan.status !== 'completed' && plan.status !== 'cancelled'" class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-rice-100">
            <button
              v-if="plan.status === 'draft'"
              class="btn-secondary !py-1 !px-2 text-xs !bg-blue-50 !text-blue-700 !border-blue-200 hover:!bg-blue-100"
              @click.stop="quickChangeStatus(plan, 'scheduled')"
            >
              <Clock class="w-3 h-3" />
              → 已排期
            </button>
            <button
              v-if="plan.status === 'scheduled' || plan.status === 'draft'"
              class="btn-secondary !py-1 !px-2 text-xs !bg-purple-50 !text-purple-700 !border-purple-200 hover:!bg-purple-100"
              @click.stop="quickChangeStatus(plan, 'in_progress')"
            >
              <Play class="w-3 h-3" />
              → 开始排练
            </button>
            <button
              v-if="plan.status === 'in_progress' && getPlanStats(plan).notStarted === 0"
              class="btn-secondary !py-1 !px-2 text-xs !bg-bamboo-50 !text-bamboo-700 !border-bamboo-200 hover:!bg-bamboo-100"
              @click.stop="quickChangeStatus(plan, 'completed')"
            >
              <Check class="w-3 h-3" />
              → 完成
            </button>
          </div>
        </div>
      </div>
    </main>

    <RehearsalPlanModal
      :visible="showModal"
      :edit-plan="editingPlan"
      @close="showModal = false; editingPlan = null"
      @saved="() => {}"
    />

    <ToastContainer />
  </div>
</template>
