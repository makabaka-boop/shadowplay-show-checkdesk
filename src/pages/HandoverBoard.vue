<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  PackageX,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  Edit3,
  Save,
  X,
  Check,
  Package,
  UserX,
  ClipboardCheck,
  Filter,
  ListTodo,
  ListChecks,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import { useBatchOperations } from '../composables/useBatchOperations';
import type { Character, HandoverStatus, RiskLevel } from '../types';
import { HANDOVER_LABELS, RISK_LABELS } from '../types';

const { characters, allStories, updateCharacter } = useCharacters();
const { success, warning } = useToast();
const { clearSelection } = useBatchOperations();

const selectedStory = ref<string>('');
const selectedOwner = ref<string>('');
const listFilterMode = ref<'todo' | 'done' | 'all'>('todo');
const editingId = ref<string | null>(null);
const editHandoverStatus = ref<HandoverStatus>('not_checked');
const editHandoverNote = ref('');
const expandedIds = ref<Set<string>>(new Set());

onMounted(() => {
  clearSelection();
});

const visibleIds = computed(() => filteredCharacters.value.map(c => c.id));

watch(allStories, (stories) => {
  if (stories.length > 0) {
    if (!selectedStory.value || !stories.includes(selectedStory.value)) {
      selectedStory.value = stories[0];
      selectedOwner.value = '';
      expandedIds.value = new Set();
    }
  } else {
    selectedStory.value = '';
    selectedOwner.value = '';
    expandedIds.value = new Set();
  }
}, { immediate: true });

const storyCharacters = computed(() => {
  if (!selectedStory.value) return [];
  return characters.value
    .filter(c => c.story === selectedStory.value)
    .sort((a, b) => a.demoOrder - b.demoOrder);
});

const storyOwners = computed(() => {
  const set = new Set(storyCharacters.value.map(c => c.owner).filter(Boolean));
  return Array.from(set).sort();
});

function hasObjectiveRisk(char: Character): boolean {
  const hasMissingParts = char.missingAccessories.some(a => a.available < a.required);
  const isHighRisk = char.riskLevel === 'high' || char.riskLevel === 'critical';
  const noOwner = !char.owner;
  return hasMissingParts || isHighRisk || noOwner;
}

const handoverStats = computed(() => {
  const chars = storyCharacters.value;
  const confirmedChars = chars.filter(c => c.handoverStatus === 'confirmed' && !hasObjectiveRisk(c));
  const hasRiskChars = chars.filter(c => c.handoverStatus === 'has_risk' || hasObjectiveRisk(c));
  const followUpChars = chars.filter(c => {
    if (c.handoverStatus === 'has_risk' || hasObjectiveRisk(c)) return false;
    return c.handoverStatus === 'follow_up';
  });
  const notCheckedChars = chars.filter(c => {
    if (c.handoverStatus === 'has_risk' || hasObjectiveRisk(c)) return false;
    if (c.handoverStatus === 'follow_up') return false;
    return c.handoverStatus === 'not_checked';
  });

  return {
    total: chars.length,
    confirmed: confirmedChars.length,
    followUp: followUpChars.length,
    hasRisk: hasRiskChars.length,
    notChecked: notCheckedChars.length,
    needParts: chars.filter(c => c.missingAccessories.some(a => a.available < a.required)).length,
    highRisk: chars.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length,
    unassignedOwner: chars.filter(c => !c.owner).length,
    readyToPack: chars.filter(c => c.status === 'ready_to_pack' || c.status === 'completed').length,
  };
});

const handoverConclusion = computed(() => {
  const stats = handoverStats.value;
  if (stats.total === 0) return null;
  
  if (stats.hasRisk > 0) {
    const reasons: string[] = [];
    if (stats.needParts > 0) reasons.push(`${stats.needParts}个角色缺件`);
    if (stats.highRisk > 0) reasons.push(`${stats.highRisk}个角色高风险`);
    if (stats.unassignedOwner > 0) reasons.push(`${stats.unassignedOwner}个角色未分配责任人`);
    return {
      level: 'has_risk' as const,
      title: '存在风险',
      description: `有 ${stats.hasRisk} 个角色存在交接风险（${reasons.join('，')}），需优先处理`,
      icon: AlertOctagon,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    };
  }
  if (stats.followUp > 0 || stats.notChecked > 0) {
    return {
      level: 'follow_up' as const,
      title: '需跟进',
      description: `有 ${stats.followUp + stats.notChecked} 个角色需要跟进确认（待跟进${stats.followUp}个，未核对${stats.notChecked}个）`,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
    };
  }
  return {
    level: 'confirmed' as const,
    title: '可交接',
    description: '所有角色交接确认完成，无缺件、无高风险、责任人均已分配，可以进行演出',
    icon: CheckCircle,
    color: 'text-bamboo-600',
    bgColor: 'bg-bamboo-50',
    borderColor: 'border-bamboo-200',
  };
});

const filteredCharacters = computed(() => {
  let chars = [...storyCharacters.value];
  
  if (selectedOwner.value) {
    chars = chars.filter(c => c.owner === selectedOwner.value || (!c.owner && selectedOwner.value === '__unassigned__'));
  }
  
  if (listFilterMode.value === 'todo') {
    chars = chars.filter(c => c.handoverStatus !== 'confirmed' || hasObjectiveRisk(c));
  } else if (listFilterMode.value === 'done') {
    chars = chars.filter(c => c.handoverStatus === 'confirmed' && !hasObjectiveRisk(c));
  }
  
  return chars;
});

const todoCount = computed(() => {
  return storyCharacters.value.filter(c => c.handoverStatus !== 'confirmed' || hasObjectiveRisk(c)).length;
});

const doneCount = computed(() => {
  return storyCharacters.value.filter(c => c.handoverStatus === 'confirmed' && !hasObjectiveRisk(c)).length;
});

const ownerStats = computed(() => {
  const stats: Record<string, { total: number; done: number; todo: number }> = {};
  storyCharacters.value.forEach(c => {
    const key = c.owner || '__unassigned__';
    if (!stats[key]) {
      stats[key] = { total: 0, done: 0, todo: 0 };
    }
    stats[key].total++;
    if (c.handoverStatus === 'confirmed' && !hasObjectiveRisk(c)) {
      stats[key].done++;
    } else {
      stats[key].todo++;
    }
  });
  return stats;
});

const needPartsCharacters = computed(() => 
  storyCharacters.value.filter(c => c.missingAccessories.some(a => a.available < a.required))
);

const highRiskCharacters = computed(() => 
  storyCharacters.value.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical')
);

const unassignedOwnerCharacters = computed(() => 
  storyCharacters.value.filter(c => !c.owner)
);

const readyToPackCharacters = computed(() => 
  storyCharacters.value.filter(c => c.status === 'ready_to_pack' || c.status === 'completed')
);

function getGapSummary(char: Character): string[] {
  const gaps: string[] = [];
  char.missingAccessories.forEach(a => {
    if (a.available < a.required) {
      gaps.push(`${a.name}缺${a.required - a.available}`);
    }
  });
  return gaps;
}

function getKeyIssues(char: Character): string[] {
  const issues: string[] = [];
  if (char.riskNote && (char.riskLevel === 'high' || char.riskLevel === 'critical')) {
    issues.push(`风险: ${char.riskNote}`);
  }
  const gaps = getGapSummary(char);
  if (gaps.length > 0) {
    issues.push(`缺件: ${gaps.join('，')}`);
  }
  if (!char.owner) {
    issues.push('⚠ 未指定责任人');
  }
  if (char.handoverNote) {
    issues.push(`交接备注: ${char.handoverNote}`);
  }
  return issues;
}

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  expandedIds.value = new Set(expandedIds.value);
}

function startEdit(char: Character) {
  editingId.value = char.id;
  editHandoverStatus.value = char.handoverStatus;
  editHandoverNote.value = char.handoverNote;
}

function cancelEdit() {
  editingId.value = null;
  editHandoverNote.value = '';
}

function saveEdit(char: Character) {
  if (editHandoverStatus.value === 'confirmed' && hasObjectiveRisk(char)) {
    warning('该角色存在缺件、高风险或未分配责任人，无法标记为可交接');
    return;
  }
  updateCharacter(char.id, {
    handoverStatus: editHandoverStatus.value,
    handoverNote: editHandoverNote.value,
  });
  success(`已更新「${char.name}」的交接状态`);
  editingId.value = null;
}

function quickHandoverStatus(char: Character, status: HandoverStatus) {
  if (status === 'confirmed' && hasObjectiveRisk(char)) {
    warning('该角色存在缺件、高风险或未分配责任人，无法标记为可交接');
    return;
  }
  updateCharacter(char.id, { handoverStatus: status });
  success(`「${char.name}」已标记为「${HANDOVER_LABELS[status]}」`);
}

function selectNextStory() {
  const idx = allStories.value.indexOf(selectedStory.value);
  if (idx < allStories.value.length - 1) {
    selectedStory.value = allStories.value[idx + 1];
    expandedIds.value = new Set();
    selectedOwner.value = '';
  }
}

function selectPrevStory() {
  const idx = allStories.value.indexOf(selectedStory.value);
  if (idx > 0) {
    selectedStory.value = allStories.value[idx - 1];
    expandedIds.value = new Set();
    selectedOwner.value = '';
  }
}

function goBack() {
  window.history.back();
}

const handoverColors: Record<HandoverStatus, string> = {
  not_checked: 'bg-gray-50 text-gray-600 border-gray-200',
  confirmed: 'bg-bamboo-50 text-bamboo-700 border-bamboo-200',
  follow_up: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  has_risk: 'bg-red-50 text-red-700 border-red-200',
};

const handoverDotColors: Record<HandoverStatus, string> = {
  not_checked: 'bg-gray-400',
  confirmed: 'bg-bamboo-500',
  follow_up: 'bg-yellow-500',
  has_risk: 'bg-red-500',
};

function getEffectiveHandoverStatus(char: Character): HandoverStatus {
  if (hasObjectiveRisk(char)) return 'has_risk';
  return char.handoverStatus;
}

function getEffectiveHandoverLabel(char: Character): string {
  if (hasObjectiveRisk(char)) {
    if (char.handoverStatus === 'confirmed') {
      return '存在风险(已标记)';
    }
    return '存在风险';
  }
  return HANDOVER_LABELS[char.handoverStatus];
}

const riskColors: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const riskIconMap = {
  low: null,
  medium: AlertTriangle,
  high: AlertTriangle,
  critical: AlertOctagon,
};

const preparationPercentage = computed(() => {
  const total = handoverStats.value.total;
  if (total === 0) return 0;
  return Math.round((handoverStats.value.readyToPack / total) * 100);
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" />

    <main class="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary !py-1.5 !px-2.5"
            @click="goBack"
          >
            <ChevronLeft class="w-4 h-4" />
            <span class="hidden sm:inline">返回</span>
          </button>
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800">演出交接核对</h2>
          <span class="tag border bg-cinnabar-50 text-cinnabar-700 border-cinnabar-200">
            <ClipboardCheck class="w-3 h-3 mr-1" />
            演出前交接
          </span>
        </div>
        <div class="text-xs sm:text-sm text-ink-500">
          共 {{ allStories.length }} 个故事
        </div>
      </div>

      <div v-if="allStories.length > 0" class="space-y-4">
        <div class="scroll-card overflow-hidden">
          <div class="flex items-stretch border-b border-rice-200 bg-gradient-to-r from-rice-100 to-rice-50">
            <button
              class="px-3 py-3 hover:bg-rice-200/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="allStories.indexOf(selectedStory) === 0"
              @click="selectPrevStory"
            >
              <ChevronLeft class="w-5 h-5 text-ink-600" />
            </button>
            <div class="flex-1 px-2 py-3 overflow-x-auto scrollbar-hide">
              <div class="flex items-center gap-1 sm:gap-2 min-w-max">
                <button
                  v-for="story in allStories"
                  :key="story"
                  :class="[
                    'px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-all whitespace-nowrap border',
                    selectedStory === story
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600 shadow-md'
                      : 'bg-white text-ink-700 border-ink-200 hover:border-cinnabar-400 hover:text-cinnabar-700'
                  ]"
                  @click="selectedStory = story; expandedIds = new Set(); selectedOwner = ''"
                >
                  {{ story }}
                </button>
              </div>
            </div>
            <button
              class="px-3 py-3 hover:bg-rice-200/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="allStories.indexOf(selectedStory) === allStories.length - 1"
              @click="selectNextStory"
            >
              <ChevronRight class="w-5 h-5 text-ink-600" />
            </button>
          </div>

          <div class="p-4 sm:p-6 space-y-4">
            <div v-if="handoverConclusion" class="p-4 rounded-lg border" :class="[handoverConclusion.bgColor, handoverConclusion.borderColor]">
              <div class="flex items-start gap-3">
                <component :is="handoverConclusion.icon" class="w-6 h-6 flex-shrink-0" :class="handoverConclusion.color" />
                <div class="flex-1">
                  <h3 class="font-bold text-lg" :class="handoverConclusion.color">
                    {{ handoverConclusion.title }}
                  </h3>
                  <p class="text-sm text-ink-600 mt-0.5">
                    {{ handoverConclusion.description }}
                  </p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
              <div class="bg-gradient-to-br from-bamboo-50 to-bamboo-100/50 rounded-lg p-3 sm:p-4 border border-bamboo-200">
                <div class="flex items-center gap-2 mb-1">
                  <CheckCircle class="w-4 h-4 sm:w-5 sm:h-5 text-bamboo-600" />
                  <span class="text-xs text-bamboo-600/80">可交接</span>
                </div>
                <div class="text-2xl sm:text-3xl font-bold text-bamboo-700 font-serif">{{ handoverStats.confirmed }}</div>
              </div>
              <div class="bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-lg p-3 sm:p-4 border border-yellow-200">
                <div class="flex items-center gap-2 mb-1">
                  <Clock class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                  <span class="text-xs text-yellow-600/80">需跟进</span>
                </div>
                <div class="text-2xl sm:text-3xl font-bold text-yellow-700 font-serif">{{ handoverStats.followUp }}</div>
              </div>
              <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3 sm:p-4 border border-red-200">
                <div class="flex items-center gap-2 mb-1">
                  <AlertOctagon class="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                  <span class="text-xs text-red-600/80">存在风险</span>
                </div>
                <div class="text-2xl sm:text-3xl font-bold text-red-700 font-serif">{{ handoverStats.hasRisk }}</div>
              </div>
              <div class="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg p-3 sm:p-4 border border-gray-200">
                <div class="flex items-center gap-2 mb-1">
                  <AlertCircle class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                  <span class="text-xs text-gray-600/80">未核对</span>
                </div>
                <div class="text-2xl sm:text-3xl font-bold text-gray-700 font-serif">{{ handoverStats.notChecked }}</div>
              </div>
              <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 sm:p-4 border border-blue-200">
                <div class="flex items-center gap-2 mb-1">
                  <Package class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  <span class="text-xs text-blue-600/80">角色总数</span>
                </div>
                <div class="text-2xl sm:text-3xl font-bold text-blue-700 font-serif">{{ handoverStats.total }}</div>
              </div>
              <div class="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-3 sm:p-4 border border-emerald-200 col-span-2 sm:col-span-3 lg:col-span-1">
                <div class="flex items-center gap-2 mb-1">
                  <PackageX class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                  <span class="text-xs text-emerald-600/80">准备进度</span>
                </div>
                <div class="text-2xl sm:text-3xl font-bold text-emerald-700 font-serif mb-1">
                  {{ preparationPercentage }}%
                </div>
                <div class="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-500"
                    :style="{ width: preparationPercentage + '%' }"
                  />
                </div>
                <div class="text-xs text-emerald-600/70 mt-1">
                  可封箱 {{ handoverStats.readyToPack }} / {{ handoverStats.total }}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div class="scroll-card p-4" :class="needPartsCharacters.length > 0 ? 'ring-1 ring-red-300' : ''">
                <div class="flex items-center gap-2 mb-3">
                  <PackageX class="w-5 h-5 text-red-500" />
                  <h4 class="font-bold text-ink-800">待补件角色</h4>
                  <span class="tag border bg-red-50 text-red-600 border-red-200 ml-auto">
                    {{ needPartsCharacters.length }}
                  </span>
                </div>
                <div v-if="needPartsCharacters.length === 0" class="text-sm text-ink-400 text-center py-4">
                  无待补件角色
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="char in needPartsCharacters"
                    :key="char.id"
                    class="flex items-center justify-between p-2 bg-red-50 rounded-md border border-red-100"
                  >
                    <span class="text-sm font-medium text-red-800">{{ char.name }}</span>
                    <span class="text-xs text-red-600">{{ getGapSummary(char).join('，') }}</span>
                  </div>
                </div>
              </div>

              <div class="scroll-card p-4" :class="highRiskCharacters.length > 0 ? 'ring-1 ring-orange-300' : ''">
                <div class="flex items-center gap-2 mb-3">
                  <AlertTriangle class="w-5 h-5 text-orange-500" />
                  <h4 class="font-bold text-ink-800">高风险角色</h4>
                  <span class="tag border bg-orange-50 text-orange-600 border-orange-200 ml-auto">
                    {{ highRiskCharacters.length }}
                  </span>
                </div>
                <div v-if="highRiskCharacters.length === 0" class="text-sm text-ink-400 text-center py-4">
                  无高风险角色
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="char in highRiskCharacters"
                    :key="char.id"
                    class="p-2 bg-orange-50 rounded-md border border-orange-100"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm font-medium text-orange-800">{{ char.name }}</span>
                      <span :class="['tag border text-xs', riskColors[char.riskLevel]]">
                        {{ RISK_LABELS[char.riskLevel] }}
                      </span>
                    </div>
                    <p v-if="char.riskNote" class="text-xs text-orange-600 line-clamp-2">{{ char.riskNote }}</p>
                  </div>
                </div>
              </div>

              <div class="scroll-card p-4" :class="unassignedOwnerCharacters.length > 0 ? 'ring-1 ring-yellow-300' : ''">
                <div class="flex items-center gap-2 mb-3">
                  <UserX class="w-5 h-5 text-yellow-600" />
                  <h4 class="font-bold text-ink-800">未分配责任人</h4>
                  <span class="tag border bg-yellow-50 text-yellow-600 border-yellow-200 ml-auto">
                    {{ unassignedOwnerCharacters.length }}
                  </span>
                </div>
                <div v-if="unassignedOwnerCharacters.length === 0" class="text-sm text-ink-400 text-center py-4">
                  所有角色已分配责任人
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="char in unassignedOwnerCharacters"
                    :key="char.id"
                    class="flex items-center justify-between p-2 bg-yellow-50 rounded-md border border-yellow-100"
                  >
                    <span class="text-sm font-medium text-yellow-800">{{ char.name }}</span>
                    <span class="text-xs text-yellow-600">出场顺序 {{ char.demoOrder }}</span>
                  </div>
                </div>
              </div>

              <div class="scroll-card p-4">
                <div class="flex items-center gap-2 mb-3">
                  <Check class="w-5 h-5 text-emerald-500" />
                  <h4 class="font-bold text-ink-800">可封箱角色</h4>
                  <span class="tag border bg-emerald-50 text-emerald-600 border-emerald-200 ml-auto">
                    {{ readyToPackCharacters.length }}
                  </span>
                </div>
                <div v-if="readyToPackCharacters.length === 0" class="text-sm text-ink-400 text-center py-4">
                  暂无可封箱角色
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="char in readyToPackCharacters"
                    :key="char.id"
                    class="flex items-center justify-between p-2 bg-emerald-50 rounded-md border border-emerald-100"
                  >
                    <span class="text-sm font-medium text-emerald-800">{{ char.name }}</span>
                    <CheckCircle class="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
              <div class="flex items-center gap-1.5 text-sm text-ink-600">
                <Users class="w-4 h-4" />
                <span>按责任人查看:</span>
              </div>
              <div class="flex flex-wrap gap-1 sm:gap-2">
                <button
                  :class="[
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    selectedOwner === ''
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="selectedOwner = ''"
                >
                  全部 ({{ storyCharacters.length }})
                </button>
                <button
                  v-for="owner in storyOwners"
                  :key="owner"
                  :class="[
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    selectedOwner === owner
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="selectedOwner = owner"
                >
                  {{ owner }} ({{ ownerStats[owner]?.todo || 0 }}待办)
                </button>
                <button
                  v-if="unassignedOwnerCharacters.length > 0"
                  :class="[
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    selectedOwner === '__unassigned__'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="selectedOwner = '__unassigned__'"
                >
                  未分配 ({{ ownerStats['__unassigned__']?.todo || 0 }}待办)
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 sm:gap-3">
              <div class="flex items-center gap-1.5 text-sm text-ink-600">
                <Filter class="w-4 h-4" />
                <span>列表筛选:</span>
              </div>
              <div class="flex gap-1 sm:gap-2">
                <button
                  :class="[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    listFilterMode === 'todo'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="listFilterMode = 'todo'"
                >
                  <ListTodo class="w-4 h-4" />
                  待办 ({{ todoCount }})
                </button>
                <button
                  :class="[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    listFilterMode === 'done'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="listFilterMode = 'done'"
                >
                  <ListChecks class="w-4 h-4" />
                  已完成 ({{ doneCount }})
                </button>
                <button
                  :class="[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                    listFilterMode === 'all'
                      ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                      : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                  ]"
                  @click="listFilterMode = 'all'"
                >
                  <ListChecks class="w-4 h-4" />
                  全部 ({{ storyCharacters.length }})
                </button>
              </div>
            </div>

            <div class="space-y-2 sm:space-y-3">
              <div v-if="filteredCharacters.length === 0" class="text-center py-12 text-ink-400 bg-rice-50 rounded-lg border border-rice-200 border-dashed">
                <p class="text-sm">
                  <template v-if="selectedOwner">该责任人</template>
                  <template v-else>当前筛选条件下</template>
                  暂无{{ listFilterMode === 'todo' ? '待办' : listFilterMode === 'done' ? '已完成' : '' }}角色
                </p>
              </div>

              <div
                v-for="char in filteredCharacters"
                :key="char.id"
                :class="[
                  'scroll-card overflow-hidden transition-all',
                  getEffectiveHandoverStatus(char) === 'has_risk' ? 'ring-2 ring-red-300' : '',
                  getEffectiveHandoverStatus(char) === 'follow_up' ? 'ring-1 ring-yellow-300' : '',
                  getEffectiveHandoverStatus(char) === 'confirmed' ? 'ring-1 ring-bamboo-300' : '',
                ]"
              >
                <div
                  :class="[
                    'p-3 sm:p-4 cursor-pointer select-none',
                    editingId !== char.id ? 'hover:bg-rice-50/80' : ''
                  ]"
                  @click="editingId !== char.id && toggleExpand(char.id)"
                >
                  <div class="flex items-start gap-3">
                    <div class="flex-shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                      <span
                        :class="[
                          'w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold border-2',
                          char.demoOrder <= 3
                            ? 'bg-gold-400/20 text-gold-600 border-gold-400/40'
                            : 'bg-ink-50 text-ink-600 border-ink-200'
                        ]"
                      >
                        {{ char.demoOrder }}
                      </span>
                      <span :class="['w-2.5 h-2.5 rounded-full', handoverDotColors[getEffectiveHandoverStatus(char)]]" />
                    </div>

                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-2 mb-1.5">
                        <h4 class="font-serif text-base sm:text-lg font-bold text-ink-800 truncate">{{ char.name }}</h4>
                        <span :class="['tag border shrink-0', handoverColors[getEffectiveHandoverStatus(char)]]">
                          {{ getEffectiveHandoverLabel(char) }}
                        </span>
                        <span
                          v-if="char.riskLevel !== 'low'"
                          :class="['tag border shrink-0 flex items-center gap-1', riskColors[char.riskLevel]]"
                        >
                          <component :is="riskIconMap[char.riskLevel]" class="w-3 h-3" />
                          {{ RISK_LABELS[char.riskLevel] }}
                        </span>
                        <span
                          v-if="getGapSummary(char).length > 0"
                          class="tag border bg-red-50 text-red-600 border-red-200 shrink-0"
                        >
                          <PackageX class="w-3 h-3 mr-1" />
                          {{ getGapSummary(char).length }}项缺件
                        </span>
                        <span
                          v-if="!char.owner"
                          class="tag border bg-yellow-50 text-yellow-600 border-yellow-200 shrink-0"
                        >
                          <UserX class="w-3 h-3 mr-1" />
                          未分配责任人
                        </span>
                      </div>

                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-2">
                        <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                          <User class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                          <span v-if="char.owner" class="text-ink-700 truncate">{{ char.owner }}</span>
                          <span v-else class="text-red-500 font-medium">未指定责任人</span>
                        </div>

                        <div class="flex items-center gap-1.5 text-xs sm:text-sm sm:col-span-2">
                          <AlertCircle class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                          <span v-if="char.handoverNote" class="text-ink-600 line-clamp-1">{{ char.handoverNote }}</span>
                          <span v-else class="text-ink-400">暂无交接备注</span>
                        </div>
                      </div>

                      <div v-if="expandedIds.has(char.id)" class="mt-3 space-y-2 animate-fade-in">
                        <div
                          v-for="(issue, idx) in getKeyIssues(char)"
                          :key="idx"
                          :class="[
                            'flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm border',
                            issue.includes('风险')
                              ? 'bg-orange-50 border-orange-200 text-orange-700'
                              : issue.includes('缺件')
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : issue.includes('⚠')
                              ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                              : 'bg-blue-50 border-blue-200 text-blue-700'
                          ]"
                        >
                          <AlertTriangle v-if="issue.includes('风险')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <PackageX v-else-if="issue.includes('缺件')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <AlertCircle v-else-if="issue.includes('⚠')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <AlertCircle v-else class="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{{ issue }}</span>
                        </div>

                        <div v-if="hasObjectiveRisk(char)" class="p-2 bg-red-50 border border-red-200 rounded-md">
                          <p class="text-xs text-red-600 flex items-center gap-1">
                            <AlertOctagon class="w-4 h-4 flex-shrink-0" />
                            <span>该角色存在客观风险（缺件/高风险/未分配责任人），不能标记为「可交接」</span>
                          </p>
                        </div>

                        <div v-if="editingId !== char.id" class="flex flex-wrap gap-2 pt-2 border-t border-rice-100">
                          <button
                            class="btn-secondary !py-1 !px-2.5 text-xs"
                            @click.stop="startEdit(char)"
                          >
                            <Edit3 class="w-3.5 h-3.5" />
                            更新交接状态
                          </button>
                          <button
                            v-if="getEffectiveHandoverStatus(char) !== 'confirmed' && !hasObjectiveRisk(char)"
                            class="btn-secondary !py-1 !px-2.5 text-xs !bg-bamboo-50 !text-bamboo-700 !border-bamboo-200 hover:!bg-bamboo-100"
                            @click.stop="quickHandoverStatus(char, 'confirmed')"
                          >
                            <Check class="w-3.5 h-3.5" />
                            → 可交接
                          </button>
                          <button
                            v-if="getEffectiveHandoverStatus(char) !== 'follow_up' && !hasObjectiveRisk(char)"
                            class="btn-secondary !py-1 !px-2.5 text-xs !bg-yellow-50 !text-yellow-700 !border-yellow-200 hover:!bg-yellow-100"
                            @click.stop="quickHandoverStatus(char, 'follow_up')"
                          >
                            <Clock class="w-3.5 h-3.5" />
                            → 需跟进
                          </button>
                          <button
                            v-if="getKeyIssues(char).length > 0 && getEffectiveHandoverStatus(char) !== 'has_risk'"
                            class="btn-secondary !py-1 !px-2.5 text-xs !bg-red-50 !text-red-700 !border-red-200 hover:!bg-red-100"
                            @click.stop="quickHandoverStatus(char, 'has_risk')"
                          >
                            <AlertTriangle class="w-3.5 h-3.5" />
                            → 存在风险
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      v-if="editingId !== char.id"
                      class="flex-shrink-0 p-1 rounded hover:bg-rice-200 text-ink-400 transition-colors"
                    >
                      <ChevronRight class="w-5 h-5" :class="expandedIds.has(char.id) ? 'rotate-90' : ''" style="transition: transform 0.2s;" />
                    </button>
                  </div>
                </div>

                <div
                  v-if="editingId === char.id"
                  class="px-3 sm:px-4 pb-4 border-t border-rice-200 bg-rice-50/50 animate-slide-up"
                >
                  <div class="pt-4 space-y-3">
                    <div>
                      <label class="label-base">交接状态</label>
                      <select v-model="editHandoverStatus" class="select-base">
                        <option v-for="(label, key) in HANDOVER_LABELS" :key="key" :value="key">
                          {{ label }}
                          <template v-if="key === 'confirmed' && hasObjectiveRisk(char)">（存在风险不可选）</template>
                        </option>
                      </select>
                      <p v-if="editHandoverStatus === 'confirmed' && hasObjectiveRisk(char)" class="text-xs text-red-500 mt-1">
                        该角色存在客观风险，无法标记为可交接
                      </p>
                    </div>
                    <div>
                      <label class="label-base">交接备注</label>
                      <textarea
                        v-model="editHandoverNote"
                        class="input-base resize-none"
                        rows="3"
                        placeholder="添加交接说明、注意事项、待跟进事项等..."
                      />
                    </div>
                    <div class="flex flex-wrap gap-2 justify-end">
                      <button class="btn-secondary !py-1.5" @click="cancelEdit">
                        <X class="w-4 h-4" />
                        取消
                      </button>
                      <button class="btn-primary !py-1.5" @click="saveEdit(char)">
                        <Save class="w-4 h-4" />
                        保存更新
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="scroll-card p-12 text-center text-ink-400">
        <p>暂无故事数据</p>
      </div>
    </main>

    <ToastContainer />
  </div>
</template>
