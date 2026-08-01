<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { X, Plus, Trash2, ChevronUp, ChevronDown, Search, UserPlus } from 'lucide-vue-next';
import type { RehearsalPlan, RehearsalStatus, RehearsalCharacter } from '../types';
import { REHEARSAL_STATUS_LABELS } from '../types';
import { useCharacters } from '../composables/useCharacters';
import { useRehearsalPlans } from '../composables/useRehearsalPlans';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  visible: boolean;
  editPlan: RehearsalPlan | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', plan: RehearsalPlan): void;
}>();

const { characters, allStories } = useCharacters();
const { addPlan, updatePlan } = useRehearsalPlans();
const { success, error, warning } = useToast();

interface FormState {
  name: string;
  story: string;
  venue: string;
  scheduledAt: string;
  owner: string;
  status: RehearsalStatus;
  characters: RehearsalCharacter[];
  problemNotes: string;
  summaryNote: string;
}

const defaultForm: FormState = {
  name: '',
  story: '',
  venue: '',
  scheduledAt: new Date().toISOString().slice(0, 16),
  owner: '',
  status: 'draft',
  characters: [],
  problemNotes: '',
  summaryNote: '',
};

const form = reactive<FormState>({ ...defaultForm });
const errors = reactive<Record<string, string>>({});
const characterSearch = ref('');
const showCharacterPicker = ref(false);

const isEdit = computed(() => !!props.editPlan);

const storyCharacters = computed(() => {
  if (!form.story) return [];
  return characters.value.filter(c => c.story === form.story);
});

const availableCharacters = computed(() => {
  const selectedIds = new Set(form.characters.map(c => c.characterId));
  return storyCharacters.value
    .filter(c => !selectedIds.has(c.id))
    .filter(c => {
      if (!characterSearch.value.trim()) return true;
      const q = characterSearch.value.trim().toLowerCase();
      return c.name.toLowerCase().includes(q) || c.owner.toLowerCase().includes(q);
    })
    .sort((a, b) => a.demoOrder - b.demoOrder);
});

const selectedCharactersSorted = computed(() => {
  return [...form.characters].sort((a, b) => a.order - b.order);
});

watch(() => props.visible, (v) => {
  if (v) {
    if (props.editPlan) {
      Object.assign(form, {
        name: props.editPlan.name,
        story: props.editPlan.story,
        venue: props.editPlan.venue,
        scheduledAt: props.editPlan.scheduledAt,
        owner: props.editPlan.owner,
        status: props.editPlan.status,
        characters: JSON.parse(JSON.stringify(props.editPlan.characters)),
        problemNotes: props.editPlan.problemNotes,
        summaryNote: props.editPlan.summaryNote,
      });
    } else {
      Object.assign(form, JSON.parse(JSON.stringify(defaultForm)));
      if (allStories.value.length > 0) {
        form.story = allStories.value[0];
      }
    }
    Object.keys(errors).forEach(k => delete errors[k]);
    characterSearch.value = '';
    showCharacterPicker.value = false;
  }
});

watch(() => form.story, (newStory, oldStory) => {
  if (!newStory || newStory === oldStory) return;
  if (!isEdit.value) {
    form.characters = [];
  } else {
    const validIds = new Set(
      characters.value.filter(c => c.story === newStory).map(c => c.id)
    );
    const before = form.characters.length;
    form.characters = form.characters.filter(c => validIds.has(c.characterId));
    if (form.characters.length !== before) {
      warning(`已移除 ${before - form.characters.length} 个不属于故事「${newStory}」的角色`);
    }
  }
});

function validate(): boolean {
  Object.keys(errors).forEach(k => delete errors[k]);
  if (!form.name.trim()) errors.name = '请输入场次名称';
  if (!form.story.trim()) errors.story = '请选择所属故事';
  if (!form.scheduledAt) errors.scheduledAt = '请选择排练时间';
  return Object.keys(errors).length === 0;
}

function handleSave() {
  if (!validate()) return;

  if (form.characters.length === 0) {
    warning('请至少添加一个角色到场次中');
    return;
  }

  if (isEdit.value && props.editPlan) {
    const result = updatePlan(props.editPlan.id, { ...form });
    if (result) {
      success(`排练场次「${form.name}」已更新`);
      emit('saved', result);
      emit('close');
    } else {
      error('更新失败');
    }
  } else {
    const result = addPlan({ ...form });
    success(`排练场次「${form.name}」已创建`);
    emit('saved', result);
    emit('close');
  }
}

function addCharacter(characterId: string) {
  if (form.characters.some(c => c.characterId === characterId)) return;

  const maxOrder = form.characters.length > 0
    ? Math.max(...form.characters.map(c => c.order))
    : 0;

  form.characters.push({
    characterId,
    order: maxOrder + 1,
    rehearsalResult: 'not_started',
    rehearsalNote: '',
    checkedBy: '',
  });
}

function removeCharacter(characterId: string) {
  const idx = form.characters.findIndex(c => c.characterId === characterId);
  if (idx !== -1) {
    form.characters.splice(idx, 1);
  }
}

function moveCharacter(characterId: string, direction: 'up' | 'down') {
  const sorted = [...form.characters].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.characterId === characterId);
  if (idx === -1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const tempOrder = sorted[idx].order;
  sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
  sorted[swapIdx] = { ...sorted[swapIdx], order: tempOrder };

  form.characters = sorted;
}

function addAllStoryCharacters() {
  const existingIds = new Set(form.characters.map(c => c.characterId));
  let order = form.characters.length > 0
    ? Math.max(...form.characters.map(c => c.order))
    : 0;

  storyCharacters.value
    .filter(c => !existingIds.has(c.id))
    .sort((a, b) => a.demoOrder - b.demoOrder)
    .forEach(c => {
      order++;
      form.characters.push({
        characterId: c.id,
        order,
        rehearsalResult: 'not_started',
        rehearsalNote: '',
        checkedBy: '',
      });
    });

  success(`已添加 ${storyCharacters.value.length - existingIds.size} 个角色`);
}

function getCharacterName(id: string): string {
  return characters.value.find(c => c.id === id)?.name || '未知角色';
}

function getCharacterOwner(id: string): string {
  return characters.value.find(c => c.id === id)?.owner || '';
}
</script>

<template>
  <div v-if="visible" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-content max-w-4xl">
      <div class="flex items-center justify-between px-5 py-4 border-b border-rice-200 bg-gradient-to-r from-cinnabar-50 to-rice-50">
        <h2 class="font-serif text-lg font-bold text-ink-900">
          {{ isEdit ? '编辑排练场次' : '新增排练场次' }}
        </h2>
        <button
          class="p-1.5 rounded hover:bg-rice-200 text-ink-500 hover:text-ink-700 transition-colors"
          @click="emit('close')"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-5 overflow-y-auto max-h-[calc(90vh-140px)]">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="sm:col-span-2">
            <label class="label-base">场次名称 <span class="text-red-500">*</span></label>
            <input v-model="form.name" class="input-base" placeholder="如：三打白骨精 - 首次全流程排练" />
            <p v-if="errors.name" class="text-xs text-red-500 mt-1">{{ errors.name }}</p>
          </div>

          <div>
            <label class="label-base">所属故事 <span class="text-red-500">*</span></label>
            <select v-model="form.story" class="select-base">
              <option value="">请选择故事</option>
              <option v-for="story in allStories" :key="story" :value="story">{{ story }}</option>
            </select>
            <p v-if="errors.story" class="text-xs text-red-500 mt-1">{{ errors.story }}</p>
          </div>

          <div>
            <label class="label-base">排练时间 <span class="text-red-500">*</span></label>
            <input v-model="form.scheduledAt" type="datetime-local" class="input-base" />
            <p v-if="errors.scheduledAt" class="text-xs text-red-500 mt-1">{{ errors.scheduledAt }}</p>
          </div>

          <div>
            <label class="label-base">排练场地</label>
            <input v-model="form.venue" class="input-base" placeholder="如：剧院一号排练厅" />
          </div>

          <div>
            <label class="label-base">场次状态</label>
            <select v-model="form.status" class="select-base">
              <option v-for="(label, key) in REHEARSAL_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>

          <div class="sm:col-span-2">
            <label class="label-base">责任人 / 导演</label>
            <input v-model="form.owner" class="input-base" placeholder="请输入责任人姓名" />
          </div>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between mb-2">
            <label class="label-base !mb-0">参演角色（{{ form.characters.length }}）</label>
            <div class="flex items-center gap-2">
              <button
                v-if="storyCharacters.length > 0"
                class="btn-secondary !py-1 !px-2.5 text-xs"
                @click="addAllStoryCharacters"
              >
                <UserPlus class="w-3.5 h-3.5" />
                一键添加全部
              </button>
              <button
                class="btn-secondary !py-1 !px-2.5 text-xs"
                @click="showCharacterPicker = !showCharacterPicker"
              >
                <Plus class="w-3.5 h-3.5" />
                {{ showCharacterPicker ? '收起选择器' : '选择角色' }}
              </button>
            </div>
          </div>

          <div
            v-if="showCharacterPicker"
            class="mb-3 p-3 bg-rice-50 rounded-lg border border-rice-200 animate-slide-up"
          >
            <div v-if="!form.story" class="text-sm text-ink-400 text-center py-2">
              请先选择所属故事
            </div>
            <template v-else>
              <div class="relative mb-3">
                <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  v-model="characterSearch"
                  class="input-base pl-9"
                  placeholder="搜索角色名或责任人..."
                />
              </div>
              <div v-if="availableCharacters.length === 0" class="text-sm text-ink-400 text-center py-4">
                {{ storyCharacters.length === 0 ? '该故事暂无角色' : '所有角色都已添加' }}
              </div>
              <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                <button
                  v-for="c in availableCharacters"
                  :key="c.id"
                  class="flex items-center justify-between gap-2 p-2 bg-white rounded-md border border-ink-200 hover:border-cinnabar-400 hover:bg-cinnabar-50 text-left transition-all"
                  @click="addCharacter(c.id)"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-ink-800 truncate">{{ c.name }}</div>
                    <div class="text-xs text-ink-400">{{ c.owner || '未分配' }} · #{{ c.demoOrder }}</div>
                  </div>
                  <Plus class="w-4 h-4 text-cinnabar-500 flex-shrink-0" />
                </button>
              </div>
            </template>
          </div>

          <div v-if="selectedCharactersSorted.length === 0" class="scroll-card p-6 text-center text-ink-400">
            <p class="text-sm">暂无角色，点击上方「选择角色」添加</p>
          </div>
          <div v-else class="border border-ink-200 rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-rice-100">
                <tr>
                  <th class="text-left px-3 py-2 font-medium text-ink-700 w-16">顺序</th>
                  <th class="text-left px-3 py-2 font-medium text-ink-700">角色名</th>
                  <th class="text-left px-3 py-2 font-medium text-ink-700 hidden sm:table-cell">责任人</th>
                  <th class="w-20"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(rc, idx) in selectedCharactersSorted"
                  :key="rc.characterId"
                  class="border-t border-rice-100 hover:bg-rice-50"
                >
                  <td class="px-3 py-2">
                    <span
                      :class="[
                        'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border',
                        rc.order <= 3
                          ? 'bg-gold-400/20 text-gold-600 border-gold-400/40'
                          : 'bg-ink-50 text-ink-600 border-ink-200'
                      ]"
                    >
                      {{ rc.order }}
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <span class="font-medium text-ink-800">{{ getCharacterName(rc.characterId) }}</span>
                  </td>
                  <td class="px-3 py-2 text-ink-500 hidden sm:table-cell">
                    {{ getCharacterOwner(rc.characterId) || '未分配' }}
                  </td>
                  <td class="px-2 py-2">
                    <div class="flex items-center justify-end gap-1">
                      <button
                        class="p-1 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                        :disabled="idx === 0"
                        @click="moveCharacter(rc.characterId, 'up')"
                      >
                        <ChevronUp class="w-4 h-4" />
                      </button>
                      <button
                        class="p-1 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                        :disabled="idx === selectedCharactersSorted.length - 1"
                        @click="moveCharacter(rc.characterId, 'down')"
                      >
                        <ChevronDown class="w-4 h-4" />
                      </button>
                      <button
                        class="p-1 text-red-400 hover:text-red-600"
                        @click="removeCharacter(rc.characterId)"
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

        <div class="mt-5 grid grid-cols-1 gap-4">
          <div>
            <label class="label-base">排练问题记录</label>
            <textarea
              v-model="form.problemNotes"
              class="input-base resize-none"
              rows="3"
              placeholder="记录本次排练中发现的问题、需要跟进的事项等..."
            />
          </div>
          <div>
            <label class="label-base">场次总结 / 备注</label>
            <textarea
              v-model="form.summaryNote"
              class="input-base resize-none"
              rows="2"
              placeholder="场次整体情况总结、特别说明等..."
            />
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-rice-200 bg-rice-50/50">
        <button class="btn-secondary" @click="emit('close')">取消</button>
        <button class="btn-primary" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建场次' }}
        </button>
      </div>
    </div>
  </div>
</template>
