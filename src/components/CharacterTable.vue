<script setup lang="ts">
import { computed } from 'vue';
import {
  Copy,
  Edit,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
} from 'lucide-vue-next';
import { useDemoMode } from '../composables/useDemoMode';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useAutoCheck } from '../composables/useAutoCheck';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';
import type { Character, CharacterStatus, RiskLevel } from '../types';
import { STATUS_LABELS, RISK_LABELS } from '../types';

const props = defineProps<{
  selectedId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', character: Character): void;
  (e: 'edit', character: Character): void;
}>();

const { demoCharacters, isDemoMode } = useDemoMode();
const { isSelected, toggleSelect, selectAll, clearSelection } = useBatchOperations();
const { characterHasIssues, getCharacterIssues, hasMissingAccessories } = useAutoCheck();
const { copyCharacter, deleteCharacter } = useCharacters();
const { success, warning } = useToast();

const allIds = computed(() => demoCharacters.value.map(c => c.id));

const allSelected = computed(() => {
  if (allIds.value.length === 0) return false;
  return allIds.value.every(id => isSelected(id));
});

function toggleSelectAll() {
  if (allSelected.value) {
    clearSelection();
  } else {
    selectAll(allIds.value);
  }
}

function handleCopy(char: Character, event: Event) {
  event.stopPropagation();
  const result = copyCharacter(char.id);
  if (result) {
    success(`已复制角色「${char.name}」`);
  }
}

function handleDelete(char: Character, event: Event) {
  event.stopPropagation();
  if (confirm(`确定要删除角色「${char.name}」吗？`)) {
    deleteCharacter(char.id);
    warning(`已删除角色「${char.name}」`);
    if (props.selectedId === char.id) {
      emit('select', null as any);
    }
  }
}

const statusColors: Record<CharacterStatus, string> = {
  pending_assembly: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_demo: 'bg-purple-50 text-purple-700 border-purple-200',
  need_parts: 'bg-red-50 text-red-700 border-red-200',
  ready_to_pack: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-gray-50 text-gray-600 border-gray-200',
};

const riskColors: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

const issueIcon = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const issueColor = {
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
};
</script>

<template>
  <div class="scroll-card flex flex-col h-full overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-rice-200 bg-rice-50/50">
      <h3 class="font-medium text-ink-800 font-serif flex items-center gap-2">
        角色列表
        <span class="tag bg-cinnabar-100 text-cinnabar-700">
          {{ demoCharacters.length }} 个
        </span>
        <span v-if="isDemoMode" class="tag bg-gold-400/20 text-gold-600">
          演示前核对模式
        </span>
      </h3>
    </div>

    <div class="flex-1 overflow-auto">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-rice-100 z-10 border-b border-rice-200">
          <tr>
            <th class="w-10 px-3 py-2 text-left">
              <input
                type="checkbox"
                :checked="allSelected"
                @change="toggleSelectAll"
                class="rounded border-ink-300 text-cinnabar-700 focus:ring-cinnabar-500"
              />
            </th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 w-12">顺序</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600">角色名</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 hidden md:table-cell">所属故事</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 hidden sm:table-cell w-16">连杆</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 w-24">状态</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 w-20 hidden lg:table-cell">风险</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 hidden lg:table-cell">责任人</th>
            <th class="px-3 py-2 text-left font-medium text-ink-600 w-20">检查</th>
            <th class="px-3 py-2 text-right font-medium text-ink-600 w-24">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="demoCharacters.length === 0">
            <td colspan="10" class="px-4 py-12 text-center text-ink-400">
              <div class="flex flex-col items-center gap-2">
                <Check class="w-8 h-8 text-bamboo-500/50" v-if="isDemoMode" />
                <p>{{ isDemoMode ? '所有角色均已就绪，无待核对项！' : '暂无角色核对记录，请新增或载入备份' }}</p>
              </div>
            </td>
          </tr>
          <tr
            v-for="char in demoCharacters"
            :key="char.id"
            :class="[
              'table-row-hover border-b border-rice-100',
              selectedId === char.id ? 'bg-cinnabar-50/60' : '',
              hasMissingAccessories(char) ? 'bg-red-50/30' : '',
            ]"
            @click="emit('select', char)"
          >
            <td class="px-3 py-2.5" @click.stop>
              <input
                type="checkbox"
                :checked="isSelected(char.id)"
                @change="toggleSelect(char.id)"
                class="rounded border-ink-300 text-cinnabar-700 focus:ring-cinnabar-500"
              />
            </td>
            <td class="px-3 py-2.5">
              <span
                :class="[
                  'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                  char.demoOrder <= 3 ? 'bg-gold-400/20 text-gold-600' : 'bg-ink-100 text-ink-600'
                ]"
              >
                {{ char.demoOrder }}
              </span>
            </td>
            <td class="px-3 py-2.5">
              <div class="font-medium text-ink-800">{{ char.name }}</div>
              <div class="text-xs text-ink-400 md:hidden">{{ char.story }}</div>
            </td>
            <td class="px-3 py-2.5 text-ink-600 hidden md:table-cell">{{ char.story }}</td>
            <td class="px-3 py-2.5 hidden sm:table-cell">
              <span :class="char.linkCount <= 0 || char.linkCount > 20 ? 'text-red-600 font-medium' : 'text-ink-600'">
                {{ char.linkCount }}
              </span>
            </td>
            <td class="px-3 py-2.5">
              <span :class="['tag border', statusColors[char.status]]">
                {{ STATUS_LABELS[char.status] }}
              </span>
            </td>
            <td class="px-3 py-2.5 hidden lg:table-cell">
              <span :class="['tag border', riskColors[char.riskLevel]]">
                {{ RISK_LABELS[char.riskLevel] }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-ink-600 hidden lg:table-cell">
              <span v-if="char.owner">{{ char.owner }}</span>
              <span v-else class="text-red-500 text-xs">未指定</span>
            </td>
            <td class="px-3 py-2.5">
              <div v-if="characterHasIssues(char.id)" class="flex items-center gap-1">
                <component
                  v-for="issue in getCharacterIssues(char.id).slice(0, 2)"
                  :key="issue.type + issue.message"
                  :is="issueIcon[issue.type]"
                  :class="['w-4 h-4', issueColor[issue.type]]"
                  :title="issue.message"
                />
              </div>
              <span v-else class="text-bamboo-600 text-xs">正常</span>
            </td>
            <td class="px-3 py-2.5">
              <div class="flex items-center justify-end gap-1">
                <button
                  class="p-1.5 rounded hover:bg-rice-200 text-ink-500 hover:text-cinnabar-700 transition-colors"
                  title="复制"
                  @click="handleCopy(char, $event)"
                >
                  <Copy class="w-4 h-4" />
                </button>
                <button
                  class="p-1.5 rounded hover:bg-rice-200 text-ink-500 hover:text-cinnabar-700 transition-colors"
                  title="编辑"
                  @click.stop="emit('edit', char)"
                >
                  <Edit class="w-4 h-4" />
                </button>
                <button
                  class="p-1.5 rounded hover:bg-red-50 text-ink-500 hover:text-red-600 transition-colors"
                  title="删除"
                  @click="handleDelete(char, $event)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
