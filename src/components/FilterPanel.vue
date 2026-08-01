<script setup lang="ts">
import { X, RotateCcw, Filter } from 'lucide-vue-next';
import { useFilters } from '../composables/useFilters';
import { useCharacters } from '../composables/useCharacters';
import type { CharacterStatus, RiskLevel } from '../types';
import { STATUS_LABELS, RISK_LABELS } from '../types';

const { filters, toggleStatusFilter, toggleRiskFilter, setFilter, resetFilters, hasActiveFilters } = useFilters();
const { allStories, allOwners } = useCharacters();

const statusColors: Record<CharacterStatus, string> = {
  pending_assembly: 'bg-blue-100 text-blue-700 border-blue-200',
  pending_demo: 'bg-purple-100 text-purple-700 border-purple-200',
  need_parts: 'bg-red-100 text-red-700 border-red-200',
  ready_to_pack: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
};

const riskColors: Record<RiskLevel, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};
</script>

<template>
  <div class="scroll-card p-4">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Filter class="w-4 h-4 text-cinnabar-700" />
        <h3 class="font-medium text-ink-800 font-serif">筛选条件</h3>
        <span
          v-if="hasActiveFilters"
          class="tag bg-cinnabar-100 text-cinnabar-700"
        >
          已激活
        </span>
      </div>
      <button
        v-if="hasActiveFilters"
        class="text-xs text-ink-500 hover:text-cinnabar-700 flex items-center gap-1 transition-colors"
        @click="resetFilters"
      >
        <RotateCcw class="w-3 h-3" />
        重置
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <div>
        <label class="label-base">所属故事</label>
        <select
          class="select-base"
          :value="filters.story"
          @change="(e) => setFilter('story', (e.target as HTMLSelectElement).value)"
        >
          <option value="">全部故事</option>
          <option v-for="story in allStories" :key="story" :value="story">{{ story }}</option>
        </select>
      </div>

      <div>
        <label class="label-base">责任人</label>
        <select
          class="select-base"
          :value="filters.owner"
          @change="(e) => setFilter('owner', (e.target as HTMLSelectElement).value)"
        >
          <option value="">全部责任人</option>
          <option v-for="owner in allOwners" :key="owner" :value="owner">{{ owner }}</option>
        </select>
      </div>

      <div class="xl:col-span-2">
        <label class="label-base">当前状态</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="(label, key) in STATUS_LABELS"
            :key="key"
            :class="[
              'px-2 py-1 text-xs rounded border transition-all',
              filters.status.includes(key as CharacterStatus)
                ? statusColors[key as CharacterStatus] + ' ring-2 ring-offset-1 ring-cinnabar-500/40'
                : 'bg-white text-ink-600 border-ink-200 hover:border-ink-300'
            ]"
            @click="toggleStatusFilter(key as CharacterStatus)"
          >
            <span v-if="filters.status.includes(key as CharacterStatus)" class="mr-0.5">✓</span>
            {{ label }}
          </button>
        </div>
      </div>

      <div class="xl:col-span-2">
        <label class="label-base">风险等级</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="(label, key) in RISK_LABELS"
            :key="key"
            :class="[
              'px-2 py-1 text-xs rounded border transition-all',
              filters.riskLevel.includes(key as RiskLevel)
                ? riskColors[key as RiskLevel] + ' ring-2 ring-offset-1 ring-cinnabar-500/40'
                : 'bg-white text-ink-600 border-ink-200 hover:border-ink-300'
            ]"
            @click="toggleRiskFilter(key as RiskLevel)"
          >
            <span v-if="filters.riskLevel.includes(key as RiskLevel)" class="mr-0.5">✓</span>
            {{ label }}
          </button>
        </div>
      </div>

      <div class="sm:col-span-2 lg:col-span-1">
        <label class="label-base">演示顺序区间</label>
        <div class="flex items-center gap-1.5">
          <input
            type="number"
            class="input-base !w-20"
            placeholder="最小"
            :value="filters.orderMin ?? ''"
            min="1"
            @input="(e) => {
              const v = (e.target as HTMLInputElement).value;
              setFilter('orderMin', v === '' ? null : Number(v));
            }"
          />
          <span class="text-ink-400">—</span>
          <input
            type="number"
            class="input-base !w-20"
            placeholder="最大"
            :value="filters.orderMax ?? ''"
            min="1"
            @input="(e) => {
              const v = (e.target as HTMLInputElement).value;
              setFilter('orderMax', v === '' ? null : Number(v));
            }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
