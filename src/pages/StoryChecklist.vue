<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Wrench,
  Play,
  PackageX,
  AlertTriangle,
  Filter,
  Edit3,
  Check,
  X,
  Save,
  User,
  AlertCircle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next';
import TopBar from '../components/TopBar.vue';
import ToastContainer from '../components/ToastContainer.vue';
import CharacterModal from '../components/CharacterModal.vue';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import { useAutoCheck } from '../composables/useAutoCheck';
import { useBatchOperations } from '../composables/useBatchOperations';
import type { Character, CharacterStatus, RiskLevel } from '../types';
import { STATUS_LABELS, RISK_LABELS } from '../types';

const { characters, allStories, updateCharacter, getCharacterById } = useCharacters();
const { success, warning } = useToast();
const { hasMissingAccessories } = useAutoCheck();
const { clearSelection } = useBatchOperations();

const showModal = ref(false);
const editingCharacter = ref<Character | null>(null);

const selectedStory = ref<string>('');
const filterMode = ref<'all' | 'incomplete' | 'risk'>('all');
const editingId = ref<string | null>(null);
const editStatus = ref<CharacterStatus>('pending_assembly');
const editRepairNote = ref('');
const expandedIds = ref<Set<string>>(new Set());

onMounted(() => {
  clearSelection();
});

const visibleIds = computed(() => filteredCharacters.value.map(c => c.id));

watch(allStories, (stories) => {
  if (stories.length > 0 && !selectedStory.value) {
    selectedStory.value = stories[0];
  }
}, { immediate: true });

const storyCharacters = computed(() => {
  if (!selectedStory.value) return [];
  return characters.value
    .filter(c => c.story === selectedStory.value)
    .sort((a, b) => a.demoOrder - b.demoOrder);
});

const storyStats = computed(() => {
  const chars = storyCharacters.value;
  return {
    total: chars.length,
    pendingAssembly: chars.filter(c => c.status === 'pending_assembly').length,
    pendingDemo: chars.filter(c => c.status === 'pending_demo').length,
    needParts: chars.filter(c => c.status === 'need_parts').length,
    highRisk: chars.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length,
    completed: chars.filter(c => c.status === 'completed').length,
    readyToPack: chars.filter(c => c.status === 'ready_to_pack').length,
    unassignedOwners: chars.filter(c => !c.owner).length,
  };
});

const filteredCharacters = computed(() => {
  let chars = [...storyCharacters.value];
  if (filterMode.value === 'incomplete') {
    chars = chars.filter(c => c.status !== 'completed' && c.status !== 'ready_to_pack');
  } else if (filterMode.value === 'risk') {
    chars = chars.filter(c => {
      const hasRisk = c.riskLevel === 'high' || c.riskLevel === 'critical';
      const hasParts = c.status === 'need_parts';
      const noOwner = !c.owner;
      return hasRisk || hasParts || noOwner;
    });
  }
  return chars;
});

const incompleteCount = computed(() => {
  return storyCharacters.value.filter(c => c.status !== 'completed' && c.status !== 'ready_to_pack').length;
});

const completionPercentage = computed(() => {
  const total = storyStats.value.total;
  if (total === 0) return 0;
  const done = storyStats.value.completed + storyStats.value.readyToPack;
  return Math.round((done / total) * 100);
});

function getGapSummary(char: Character): string[] {
  const gaps: string[] = [];
  char.missingAccessories.forEach(a => {
    if (a.available < a.required) {
      gaps.push(`${a.name}缺${a.required - a.available}`);
    }
  });
  return gaps;
}

function getKeyReminders(char: Character): string[] {
  const reminders: string[] = [];
  if (char.riskNote) {
    reminders.push(`风险: ${char.riskNote}`);
  }
  if (char.repairNote && char.status === 'need_parts') {
    reminders.push(`修备: ${char.repairNote}`);
  }
  char.operationReminders.slice(0, 2).forEach(r => {
    reminders.push(`提醒: ${r}`);
  });
  if (!char.owner) {
    reminders.push('⚠ 未指定责任人');
  }
  return reminders;
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
  editStatus.value = char.status;
  editRepairNote.value = char.repairNote;
}

function cancelEdit() {
  editingId.value = null;
  editRepairNote.value = '';
}

function saveEdit(char: Character) {
  updateCharacter(char.id, {
    status: editStatus.value,
    repairNote: editRepairNote.value,
  });
  success(`已更新「${char.name}」的状态和备注`);
  editingId.value = null;
}

function quickStatus(char: Character, status: CharacterStatus) {
  updateCharacter(char.id, { status });
  success(`「${char.name}」已标记为「${STATUS_LABELS[status]}」`);
}

function selectNextStory() {
  const idx = allStories.value.indexOf(selectedStory.value);
  if (idx < allStories.value.length - 1) {
    selectedStory.value = allStories.value[idx + 1];
    expandedIds.value = new Set();
  }
}

function selectPrevStory() {
  const idx = allStories.value.indexOf(selectedStory.value);
  if (idx > 0) {
    selectedStory.value = allStories.value[idx - 1];
    expandedIds.value = new Set();
  }
}

const statusColors: Record<CharacterStatus, string> = {
  pending_assembly: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_demo: 'bg-purple-50 text-purple-700 border-purple-200',
  need_parts: 'bg-red-50 text-red-700 border-red-200',
  ready_to_pack: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-gray-50 text-gray-600 border-gray-200',
};

const statusDotColors: Record<CharacterStatus, string> = {
  pending_assembly: 'bg-blue-500',
  pending_demo: 'bg-purple-500',
  need_parts: 'bg-red-500',
  ready_to_pack: 'bg-emerald-500',
  completed: 'bg-gray-400',
};

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

function goBack() {
  window.history.back();
}

function openCreate() {
  editingCharacter.value = null;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingCharacter.value = null;
}

function handleSaved() {
  // 新增角色后不需要特殊处理，数据会自动同步
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <TopBar :visible-ids="visibleIds" @open-create="openCreate" />

    <main class="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary !py-1.5 !px-2.5"
            @click="goBack"
          >
            <ChevronLeft class="w-4 h-4" />
            <span class="hidden sm:inline">返回</span>
          </button>
          <h2 class="font-serif text-lg sm:text-2xl font-bold text-ink-800">故事演出清单</h2>
        </div>
        <div class="text-xs sm:text-sm text-ink-500">
          共 {{ allStories.length }} 个故事
        </div>
      </div>

      <div v-if="allStories.length > 0" class="scroll-card overflow-hidden">
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
                @click="selectedStory = story; expandedIds = new Set()"
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

        <div class="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <div class="bg-gradient-to-br from-ink-50 to-ink-100/50 rounded-lg p-3 sm:p-4 border border-ink-200">
              <div class="flex items-center gap-2 mb-1">
                <Users class="w-4 h-4 sm:w-5 sm:h-5 text-ink-600" />
                <span class="text-xs text-ink-500">角色总数</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-ink-800 font-serif">{{ storyStats.total }}</div>
            </div>
            <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3 sm:p-4 border border-blue-200">
              <div class="flex items-center gap-2 mb-1">
                <Wrench class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                <span class="text-xs text-blue-600/80">待装配</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-blue-700 font-serif">{{ storyStats.pendingAssembly }}</div>
            </div>
            <div class="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-3 sm:p-4 border border-purple-200">
              <div class="flex items-center gap-2 mb-1">
                <Play class="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                <span class="text-xs text-purple-600/80">待演示</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-purple-700 font-serif">{{ storyStats.pendingDemo }}</div>
            </div>
            <div class="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3 sm:p-4 border border-red-200">
              <div class="flex items-center gap-2 mb-1">
                <PackageX class="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                <span class="text-xs text-red-600/80">缺件角色</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-red-700 font-serif">{{ storyStats.needParts }}</div>
            </div>
            <div class="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-3 sm:p-4 border border-orange-200">
              <div class="flex items-center gap-2 mb-1">
                <AlertTriangle class="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                <span class="text-xs text-orange-600/80">高风险</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-orange-700 font-serif">{{ storyStats.highRisk }}</div>
            </div>
            <div class="bg-gradient-to-br from-bamboo-500/10 to-bamboo-600/10 rounded-lg p-3 sm:p-4 border border-bamboo-500/30 col-span-2 sm:col-span-3 lg:col-span-1">
              <div class="flex items-center gap-2 mb-1">
                <Check class="w-4 h-4 sm:w-5 sm:h-5 text-bamboo-600" />
                <span class="text-xs text-bamboo-600/80">准备进度</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-bamboo-700 font-serif mb-1">{{ completionPercentage }}%</div>
              <div class="w-full h-1.5 bg-bamboo-500/20 rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-bamboo-500 to-bamboo-600 rounded-full transition-all duration-500"
                  :style="{ width: completionPercentage + '%' }"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
            <div class="flex items-center gap-1.5 text-sm text-ink-600">
              <Filter class="w-4 h-4" />
              <span>筛选:</span>
            </div>
            <div class="flex flex-wrap gap-1 sm:gap-2">
              <button
                :class="[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  filterMode === 'all'
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="filterMode = 'all'"
              >
                全部 ({{ storyCharacters.length }})
              </button>
              <button
                :class="[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  filterMode === 'incomplete'
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="filterMode = 'incomplete'"
              >
                仅看未完成 ({{ incompleteCount }})
              </button>
              <button
                :class="[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  filterMode === 'risk'
                    ? 'bg-cinnabar-700 text-white border-cinnabar-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-cinnabar-400'
                ]"
                @click="filterMode = 'risk'"
              >
                仅看风险项 ({{
                  storyCharacters.filter(c =>
                    c.riskLevel === 'high' || c.riskLevel === 'critical' ||
                    c.status === 'need_parts' || !c.owner
                  ).length
                }})
              </button>
            </div>
          </div>

          <div class="space-y-2 sm:space-y-3">
            <div v-if="filteredCharacters.length === 0" class="text-center py-12 text-ink-400 bg-rice-50 rounded-lg border border-rice-200 border-dashed">
              <p class="text-sm">{{ filterMode === 'all' ? '该故事暂无角色' : '当前筛选条件下无内容' }}</p>
            </div>

            <div
              v-for="char in filteredCharacters"
              :key="char.id"
              :class="[
                'scroll-card overflow-hidden transition-all',
                char.status === 'need_parts' ? 'ring-1 ring-red-300' : '',
                (char.riskLevel === 'high' || char.riskLevel === 'critical') ? 'ring-1 ring-orange-300' : '',
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
                    <span :class="['w-2.5 h-2.5 rounded-full', statusDotColors[char.status]]" />
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-1.5">
                      <h4 class="font-serif text-base sm:text-lg font-bold text-ink-800 truncate">{{ char.name }}</h4>
                      <span :class="['tag border shrink-0', statusColors[char.status]]">
                        {{ STATUS_LABELS[char.status] }}
                      </span>
                      <span
                        v-if="char.riskLevel !== 'low'"
                        :class="['tag border shrink-0 flex items-center gap-1', riskColors[char.riskLevel]]"
                      >
                        <component :is="riskIconMap[char.riskLevel]" class="w-3 h-3" />
                        {{ RISK_LABELS[char.riskLevel] }}
                      </span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-2">
                      <div class="flex items-center gap-1.5 text-xs sm:text-sm">
                        <User class="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                        <span v-if="char.owner" class="text-ink-700 truncate">{{ char.owner }}</span>
                        <span v-else class="text-red-500 font-medium">未指定责任人</span>
                      </div>

                      <div class="flex items-center gap-1.5 text-xs sm:text-sm sm:col-span-2">
                        <PackageX v-if="getGapSummary(char).length > 0" class="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span v-else class="w-3.5 h-3.5 flex-shrink-0" />
                        <template v-if="getGapSummary(char).length > 0">
                          <span class="text-red-600 font-medium">{{ getGapSummary(char).join('，') }}</span>
                        </template>
                        <template v-else>
                          <span class="text-bamboo-600">配件齐全</span>
                        </template>
                      </div>
                    </div>

                    <div v-if="expandedIds.has(char.id)" class="mt-3 space-y-2 animate-fade-in">
                      <div
                        v-for="(reminder, idx) in getKeyReminders(char)"
                        :key="idx"
                        :class="[
                          'flex items-start gap-2 p-2 rounded-md text-xs sm:text-sm border',
                          reminder.includes('风险')
                            ? 'bg-orange-50 border-orange-200 text-orange-700'
                            : reminder.includes('⚠')
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : reminder.includes('修备')
                            ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                            : 'bg-blue-50 border-blue-200 text-blue-700'
                        ]"
                      >
                        <AlertTriangle v-if="reminder.includes('风险')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <AlertCircle v-else-if="reminder.includes('⚠')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <AlertTriangle v-else-if="reminder.includes('修备')" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <AlertCircle v-else class="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{{ reminder }}</span>
                      </div>

                      <div v-if="editingId !== char.id" class="flex flex-wrap gap-2 pt-2 border-t border-rice-100">
                        <button
                          class="btn-secondary !py-1 !px-2.5 text-xs"
                          @click.stop="startEdit(char)"
                        >
                          <Edit3 class="w-3.5 h-3.5" />
                          更新状态/备注
                        </button>
                        <button
                          v-if="char.status === 'pending_assembly'"
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-purple-50 !text-purple-700 !border-purple-200 hover:!bg-purple-100"
                          @click.stop="quickStatus(char, 'pending_demo')"
                        >
                          → 待演示
                        </button>
                        <button
                          v-if="char.status === 'pending_demo'"
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-emerald-50 !text-emerald-700 !border-emerald-200 hover:!bg-emerald-100"
                          @click.stop="quickStatus(char, 'ready_to_pack')"
                        >
                          → 可封箱
                        </button>
                        <button
                          v-if="char.status === 'ready_to_pack'"
                          class="btn-secondary !py-1 !px-2.5 text-xs !bg-gray-100 !text-gray-700 !border-gray-200 hover:!bg-gray-200"
                          @click.stop="quickStatus(char, 'completed')"
                        >
                          → 已完成
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    v-if="editingId !== char.id"
                    class="flex-shrink-0 p-1 rounded hover:bg-rice-200 text-ink-400 transition-colors"
                  >
                    <component :is="expandedIds.has(char.id) ? ChevronUp : ChevronDown" class="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div
                v-if="editingId === char.id"
                class="px-3 sm:px-4 pb-4 border-t border-rice-200 bg-rice-50/50 animate-slide-up"
              >
                <div class="pt-4 space-y-3">
                  <div>
                    <label class="label-base">状态</label>
                    <select v-model="editStatus" class="select-base">
                      <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="label-base">修补/补充备注</label>
                    <textarea
                      v-model="editRepairNote"
                      class="input-base resize-none"
                      rows="3"
                      placeholder="添加修补进度、补充配件信息、特殊说明等..."
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

      <div v-else class="scroll-card p-12 text-center text-ink-400">
        <p>暂无故事数据</p>
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
