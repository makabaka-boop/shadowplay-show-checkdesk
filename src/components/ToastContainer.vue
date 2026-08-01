<script setup lang="ts">
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next';
import { useToast } from '../composables/useToast';

const { toasts } = useToast();

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const iconColors = {
  success: 'text-emerald-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
};

function removeToast(id: string) {
  const idx = toasts.value.findIndex(t => t.id === id);
  if (idx !== -1) {
    toasts.value.splice(idx, 1);
  }
}
</script>

<template>
  <div class="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-md border shadow-lg animate-slide-up', colors[toast.type]]"
      >
        <component :is="icons[toast.type]" :class="['w-5 h-5 mt-0.5 flex-shrink-0', iconColors[toast.type]]" />
        <p class="flex-1 text-sm">{{ toast.message }}</p>
        <button
          class="p-0.5 rounded hover:bg-white/50 opacity-60 hover:opacity-100 transition-opacity"
          @click="removeToast(toast.id)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
.toast-move {
  transition: transform 0.25s ease;
}
</style>
