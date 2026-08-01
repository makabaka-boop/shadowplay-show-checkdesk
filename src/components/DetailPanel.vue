<script setup lang="ts">
import { computed } from 'vue';
import {
  X,
  User,
  BookOpen,
  Link,
  Hash,
  AlertTriangle,
  AlertCircle,
  Info,
  Package,
  CheckSquare,
  FileText,
  Wrench,
  Clock,
} from 'lucide-vue-next';
import type { Character, RiskLevel, CharacterStatus, CheckResult } from '../types';
import { STATUS_LABELS, RISK_LABELS } from '../types';
import { useAutoCheck } from '../composables/useAutoCheck';

const props = defineProps<{
  character: Character | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit', character: Character): void;
}>();

const { getCharacterIssues, hasMissingAccessories } = useAutoCheck();

const issues = computed<CheckResult[]>(() => {
  if (!props.character) return [];
  return getCharacterIssues(props.character.id);
});

const missingParts = computed(() => {
  if (!props.character) return [];
  return props.character.missingAccessories.filter(a => a.available < a.required);
});

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

const issueIconMap = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const issueColors = {
  error: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}
</script>

<template>
  <div class="scroll-card flex flex-col h-full overflow-hidden">
    <div v-if="!character" class="flex flex-col items-center justify-center h-full text-ink-400 p-8">
      <FileText class="w-12 h-12 mb-3 opacity-50" />
      <p class="text-sm">选择左侧角色查看详情</p>
      <p class="text-xs mt-1 text-ink-300">包含配件缺口、操作提醒和自动检查结果</p>
    </div>

    <template v-else>
      <div class="flex items-start justify-between px-5 py-4 border-b border-rice-200 bg-gradient-to-r from-rice-100 to-rice-50">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <h2 class="font-serif text-2xl font-bold text-ink-900">{{ character.name }}</h2>
            <span :class="['tag border', statusColors[character.status]]">{{ STATUS_LABELS[character.status] }}</span>
            <span :class="['tag border', riskColors[character.riskLevel]]">{{ RISK_LABELS[character.riskLevel] }}</span>
          </div>
          <div class="flex items-center gap-3 text-xs text-ink-500">
            <span class="flex items-center gap-1"><BookOpen class="w-3 h-3" />{{ character.story }}</span>
            <span class="flex items-center gap-1"><Hash class="w-3 h-3" />演示顺序 {{ character.demoOrder }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary !py-1 !px-2.5 text-xs"
            @click="emit('edit', character)"
          >
            <Wrench class="w-3.5 h-3.5" />
            编辑
          </button>
          <button
            class="p-1.5 rounded hover:bg-rice-200 text-ink-500 hover:text-ink-700 transition-colors"
            @click="emit('close')"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-5 space-y-5">
        <div v-if="issues.length > 0" class="space-y-2">
          <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5">
            <AlertTriangle class="w-4 h-4 text-amber-600" />
            自动检查结果
          </h3>
          <div
            v-for="issue in issues"
            :key="issue.type + issue.message"
            :class="['flex items-start gap-2 p-3 rounded-md border text-sm', issueColors[issue.type]]"
          >
            <component :is="issueIconMap[issue.type]" class="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{{ issue.message }}</span>
          </div>
        </div>

        <div>
          <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
            <Package class="w-4 h-4 text-cinnabar-700" />
            配件缺口清单
          </h3>
          <div v-if="character.missingAccessories.length === 0" class="text-sm text-ink-400 bg-ink-50 rounded-md p-3">
            暂无配件记录
          </div>
          <div v-else class="rounded-md border border-ink-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-rice-100">
                <tr>
                  <th class="text-left px-3 py-2 font-medium text-ink-700">配件名称</th>
                  <th class="text-center px-3 py-2 font-medium text-ink-700 w-16">需求</th>
                  <th class="text-center px-3 py-2 font-medium text-ink-700 w-16">现有</th>
                  <th class="text-center px-3 py-2 font-medium text-ink-700 w-16">缺口</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="acc in character.missingAccessories"
                  :key="acc.name"
                  :class="['border-t border-rice-100', acc.available < acc.required ? 'bg-red-50/50' : '']"
                >
                  <td class="px-3 py-2 text-ink-700">{{ acc.name }}</td>
                  <td class="text-center px-3 py-2 text-ink-600">{{ acc.required }}</td>
                  <td class="text-center px-3 py-2" :class="acc.available < acc.required ? 'text-red-600 font-medium' : 'text-bamboo-600'">
                    {{ acc.available }}
                  </td>
                  <td class="text-center px-3 py-2">
                    <span
                      v-if="acc.available < acc.required"
                      class="tag bg-red-100 text-red-700"
                    >
                      缺 {{ acc.required - acc.available }}
                    </span>
                    <span v-else class="tag bg-bamboo-600/10 text-bamboo-700">齐全</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
            <CheckSquare class="w-4 h-4 text-cinnabar-700" />
            操作提醒
          </h3>
          <div v-if="character.operationReminders.length === 0" class="text-sm text-ink-400 bg-ink-50 rounded-md p-3">
            暂无操作提醒
          </div>
          <ul v-else class="space-y-1.5">
            <li
              v-for="(reminder, idx) in character.operationReminders"
              :key="idx"
              class="flex items-start gap-2 text-sm text-ink-700 bg-rice-50 rounded-md p-2.5 border border-rice-100"
            >
              <span class="flex-shrink-0 w-5 h-5 bg-cinnabar-100 text-cinnabar-700 rounded-full flex items-center justify-center text-xs font-bold">
                {{ idx + 1 }}
              </span>
              <span>{{ reminder }}</span>
            </li>
          </ul>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
              <User class="w-4 h-4 text-cinnabar-700" />
              责任人
            </h3>
            <div class="text-sm bg-rice-50 rounded-md p-3 border border-rice-100">
              <span v-if="character.owner" class="text-ink-700">{{ character.owner }}</span>
              <span v-else class="text-red-500">未指定责任人</span>
            </div>
          </div>
          <div>
            <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
              <Link class="w-4 h-4 text-cinnabar-700" />
              连杆数量
            </h3>
            <div class="text-sm bg-rice-50 rounded-md p-3 border border-rice-100">
              <span :class="character.linkCount <= 0 || character.linkCount > 20 ? 'text-red-600 font-medium' : 'text-ink-700'">
                {{ character.linkCount }} 根
              </span>
              <span v-if="character.linkCount <= 0 || character.linkCount > 20" class="text-red-500 text-xs ml-2">（数量异常）</span>
            </div>
          </div>
        </div>

        <div>
          <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
            <Info class="w-4 h-4 text-cinnabar-700" />
            配件状态
          </h3>
          <div class="text-sm bg-rice-50 rounded-md p-3 border border-rice-100 text-ink-700">
            {{ character.accessoryStatus || '未填写' }}
          </div>
        </div>

        <div>
          <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
            <AlertTriangle class="w-4 h-4 text-amber-600" />
            风险说明
          </h3>
          <div class="text-sm bg-rice-50 rounded-md p-3 border border-rice-100">
            <span v-if="character.riskNote" class="text-ink-700">{{ character.riskNote }}</span>
            <span v-else class="text-ink-400">暂无风险说明</span>
          </div>
        </div>

        <div>
          <h3 class="font-serif text-sm font-bold text-ink-800 flex items-center gap-1.5 mb-2">
            <Wrench class="w-4 h-4 text-gold-600" />
            修补备注
          </h3>
          <div class="text-sm rounded-md p-3 border" :class="character.status === 'need_parts' && !character.repairNote ? 'bg-red-50 border-red-200 text-red-600' : 'bg-rice-50 border-rice-100 text-ink-700'">
            <span v-if="character.repairNote">{{ character.repairNote }}</span>
            <span v-else>{{ character.status === 'need_parts' ? '⚠ 需补件但缺少修补备注' : '暂无修补备注' }}</span>
          </div>
        </div>

        <div class="pt-2 border-t border-rice-100">
          <div class="flex items-center gap-4 text-xs text-ink-400">
            <span class="flex items-center gap-1"><Clock class="w-3 h-3" />创建：{{ formatDate(character.createdAt) }}</span>
            <span class="flex items-center gap-1"><Clock class="w-3 h-3" />更新：{{ formatDate(character.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
