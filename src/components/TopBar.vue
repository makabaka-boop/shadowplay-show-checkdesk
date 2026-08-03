<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Upload,
  Plus,
  Eye,
  ListChecks,
  AlertTriangle,
  AlertCircle,
  ClipboardList,
  Home,
  ClipboardCheck,
  Theater,
  ShieldAlert,
  Package,
} from 'lucide-vue-next';
import { useCharacters } from '../composables/useCharacters';
import { useAutoCheck } from '../composables/useAutoCheck';
import { useDemoMode } from '../composables/useDemoMode';
import { useToast } from '../composables/useToast';
import { useBatchOperations } from '../composables/useBatchOperations';
import { useInspectionTasks } from '../composables/useInspectionTasks';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import type { CharacterStatus, BackupPackage, BackupImportResult } from '../types';
import { STATUS_LABELS, BATCH_STATUSES } from '../types';

const router = useRouter();

const props = defineProps<{
  visibleIds?: string[];
}>();

const emit = defineEmits<{
  (e: 'openCreate'): void;
  (e: 'dataImported'): void;
}>();

const { exportData: exportCharacters, importData: importCharacters, replaceAll: replaceCharacters, characters } = useCharacters();
const { exportData: exportPlans, replaceAll: replacePlans } = useRehearsalPlans();
const { exportData: exportTasks, replaceAll: replaceTasks, validateReferences } = useInspectionTasks();
const { errorCount, warningCount } = useAutoCheck();
const { isDemoMode, toggleDemoMode } = useDemoMode();
const { success, error, warning } = useToast();
const { selectedIds, hasSelection, selectedCount, batchUpdateStatus, clearSelection } = useBatchOperations();
const { openTaskCount, criticalTaskCount } = useInspectionTasks();

const fileInputRef = ref<HTMLInputElement | null>(null);
const showBatchMenu = ref(false);

function handleExport() {
  const backup: BackupPackage = {
    version: 2,
    exportedAt: new Date().toISOString(),
    characters: JSON.parse(exportCharacters()),
    rehearsalPlans: JSON.parse(exportPlans()),
    inspectionTasks: JSON.parse(exportTasks()),
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `检查台备份包_v2_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  success(`已导出备份包：${backup.characters.length} 角色、${backup.rehearsalPlans.length} 排练计划、${backup.inspectionTasks.length} 巡检任务`);
}

function triggerImport() {
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    const result = importBackup(content);
    if (result.success) {
      const parts: string[] = [];
      if (result.isLegacy) {
        parts.push(`已从旧版备份恢复 ${result.characters} 条角色记录`);
      } else {
        parts.push(`已恢复 ${result.characters} 角色、${result.rehearsalPlans} 排练计划、${result.inspectionTasks} 巡检任务`);
      }
      if (result.duplicateIdCount > 0) {
        parts.push(`${result.duplicateIdCount} 个重复 ID 已自动重建`);
      }
      if (result.blockedTaskCount > 0) {
        parts.push(`${result.blockedTaskCount} 个关联缺失的任务已标记为阻塞`);
      }
      if (result.invalidCount > 0) {
        parts.push(`${result.invalidCount} 条格式异常已跳过`);
      }
      if (result.duplicateIdCount > 0 || result.blockedTaskCount > 0 || result.invalidCount > 0) {
        warning(parts.join('；'));
      } else {
        success(parts.join('；'));
      }
      clearSelection();
      emit('dataImported');
    } else {
      error('载入失败：文件格式不正确或内容损坏');
    }
  };
  reader.onerror = () => {
    error('备份文件读取失败');
  };
  reader.readAsText(file);
  target.value = '';
}

function importBackup(jsonStr: string): BackupImportResult {
  const empty: BackupImportResult = {
    success: false, characters: 0, rehearsalPlans: 0, inspectionTasks: 0,
    invalidCount: 0, duplicateIdCount: 0, blockedTaskCount: 0, isLegacy: false,
  };
  try {
    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed)) {
      const result = importCharacters(jsonStr);
      if (!result.success) return empty;
      const charIds = new Set(characters.value.map(c => c.id));
      const blocked = validateReferences(charIds, new Set());
      return {
        success: true,
        characters: result.count,
        rehearsalPlans: 0,
        inspectionTasks: 0,
        invalidCount: result.invalidCount,
        duplicateIdCount: 0,
        blockedTaskCount: blocked,
        isLegacy: true,
      };
    }

    if (!parsed || typeof parsed !== 'object') return empty;

    if (parsed.version !== 2) {
      if (Array.isArray(parsed.characters)) {
        return importCharacters(JSON.stringify(parsed.characters)).success
          ? { ...empty, success: true, characters: parsed.characters.length, isLegacy: true }
          : empty;
      }
      return empty;
    }

    let invalidCount = 0;
    const rawChars = Array.isArray(parsed.characters) ? parsed.characters : [];
    const rawPlans = Array.isArray(parsed.rehearsalPlans) ? parsed.rehearsalPlans : [];
    const rawTasks = Array.isArray(parsed.inspectionTasks) ? parsed.inspectionTasks : [];

    const charResult = replaceCharacters(rawChars);
    const planResult = replacePlans(rawPlans);
    const taskResult = replaceTasks(rawTasks);

    invalidCount = Math.max(0, rawChars.length - charResult.count) +
                   Math.max(0, rawPlans.length - planResult.count) +
                   Math.max(0, rawTasks.length - taskResult.count);

    const charIds = new Set(characters.value.map(c => c.id));
    const planIds = new Set((JSON.parse(exportPlans()) as any[]).map(p => p.id));
    const blocked = validateReferences(charIds, planIds);

    return {
      success: true,
      characters: charResult.count,
      rehearsalPlans: planResult.count,
      inspectionTasks: taskResult.count,
      invalidCount,
      duplicateIdCount: charResult.duplicateIdCount + planResult.duplicateIdCount + taskResult.duplicateIdCount,
      blockedTaskCount: blocked,
      isLegacy: false,
    };
  } catch {
    return empty;
  }
}

function handleBatchStatus(status: CharacterStatus) {
  const count = batchUpdateStatus(status, props.visibleIds);
  success(`已将 ${count} 个角色标记为「${STATUS_LABELS[status]}」`);
  if (props.visibleIds) {
    props.visibleIds.forEach(id => selectedIds.value.delete(id));
    selectedIds.value = new Set(selectedIds.value);
  } else {
    clearSelection();
  }
  showBatchMenu.value = false;
}
</script>

<template>
  <header class="sticky top-0 z-40 bg-gradient-to-r from-cinnabar-800 via-cinnabar-700 to-cinnabar-800 text-white shadow-lg">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-3">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-rice-200 flex items-center justify-center shadow-inner">
            <span class="text-cinnabar-700 text-xl font-serif font-bold">影</span>
          </div>
          <div>
            <h1 class="font-serif text-xl sm:text-2xl font-bold tracking-wide">皮影演出核对台</h1>
            <p class="text-xs text-rice-200/80">角色片 · 连杆 · 演出物件 · 演示顺序</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              router.currentRoute.value.name === 'home'
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-rice-100 hover:bg-white/20'
            ]"
            @click="router.push('/')"
          >
            <Home class="w-4 h-4" />
            <span class="hidden sm:inline">角色核对</span>
            <span class="sm:hidden">核对</span>
          </button>

          <button
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              router.currentRoute.value.name === 'checklist'
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-rice-100 hover:bg-white/20'
            ]"
            @click="router.push('/checklist')"
          >
            <ClipboardList class="w-4 h-4" />
            <span class="hidden sm:inline">故事演出清单</span>
            <span class="sm:hidden">清单</span>
          </button>

          <button
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              router.currentRoute.value.name === 'handover'
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-rice-100 hover:bg-white/20'
            ]"
            @click="router.push('/handover')"
          >
            <ClipboardCheck class="w-4 h-4" />
            <span class="hidden sm:inline">演出交接核对</span>
            <span class="sm:hidden">交接</span>
          </button>

          <button
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              router.currentRoute.value.name === 'rehearsal-list' || router.currentRoute.value.name === 'rehearsal-detail'
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-rice-100 hover:bg-white/20'
            ]"
            @click="router.push('/rehearsal')"
          >
            <Theater class="w-4 h-4" />
            <span class="hidden sm:inline">排练计划</span>
            <span class="sm:hidden">排练</span>
          </button>

          <button
            :class="[
              'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              router.currentRoute.value.name === 'inspection-tasks'
                ? 'bg-white/20 text-white'
                : criticalTaskCount > 0
                  ? 'bg-red-500/30 text-white hover:bg-red-500/40 ring-1 ring-red-300/50'
                  : 'bg-white/10 text-rice-100 hover:bg-white/20'
            ]"
            @click="router.push('/tasks')"
          >
            <ShieldAlert class="w-4 h-4" />
            <span class="hidden sm:inline">巡检任务</span>
            <span class="sm:hidden">任务</span>
            <span
              v-if="openTaskCount > 0"
              :class="[
                'absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
                criticalTaskCount > 0 ? 'bg-red-500 text-white' : 'bg-gold-500 text-white'
              ]"
            >
              {{ openTaskCount > 99 ? '99+' : openTaskCount }}
            </span>
          </button>

          <div class="flex items-center gap-2 mx-2 bg-white/10 rounded-md px-3 py-1.5">
            <AlertCircle class="w-4 h-4 text-rice-200" />
            <span class="text-xs">共 <span class="font-bold text-rice-100">{{ characters.length }}</span> 个角色</span>
            <span v-if="errorCount > 0" class="flex items-center gap-1 text-xs text-red-300">
              <AlertTriangle class="w-3 h-3" />{{ errorCount }}错误
            </span>
            <span v-if="warningCount > 0" class="flex items-center gap-1 text-xs text-yellow-300">
              <AlertTriangle class="w-3 h-3" />{{ warningCount }}警告
            </span>
          </div>

          <button
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              isDemoMode
                ? 'bg-gold-500 text-white shadow-md'
                : 'bg-white/10 text-rice-100 hover:bg-white/20'
            ]"
            @click="toggleDemoMode"
          >
            <Eye class="w-4 h-4" />
            <span class="hidden sm:inline">{{ isDemoMode ? '退出核对模式' : '演示前核对' }}</span>
            <span class="sm:hidden">核对</span>
          </button>

          <button class="btn-secondary !py-1.5 !bg-white/10 !text-white !border-white/20 hover:!bg-white/20" @click="triggerImport">
            <Upload class="w-4 h-4" />
            <span class="hidden sm:inline">恢复</span>
          </button>
          <button class="btn-secondary !py-1.5 !bg-white/10 !text-white !border-white/20 hover:!bg-white/20" @click="handleExport">
            <Package class="w-4 h-4" />
            <span class="hidden sm:inline">备份包</span>
          </button>

          <div class="relative" v-if="hasSelection">
            <button
              class="btn-secondary !py-1.5 !bg-gold-500 !text-white !border-gold-400 hover:!bg-gold-600"
              @click="showBatchMenu = !showBatchMenu"
            >
              <ListChecks class="w-4 h-4" />
              批量操作 ({{ selectedCount }})
            </button>
            <div
              v-if="showBatchMenu"
              class="absolute right-0 top-full mt-1 w-40 bg-white rounded-md shadow-lg border border-ink-200 py-1 z-50"
            >
              <button
                v-for="statusKey in BATCH_STATUSES"
                :key="statusKey"
                class="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-rice-100 transition-colors"
                @click="handleBatchStatus(statusKey)"
              >
                标记为「{{ STATUS_LABELS[statusKey] }}」
              </button>
            </div>
          </div>

          <button class="btn-primary !py-1.5" @click="$emit('openCreate')">
            <Plus class="w-4 h-4" />
            <span class="hidden sm:inline">新增角色</span>
            <span class="sm:hidden">新增</span>
          </button>
        </div>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".json,application/json"
      class="hidden"
      @change="handleFileChange"
    />
  </header>
</template>
