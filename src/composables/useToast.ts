import { ref } from 'vue';
import type { ToastMessage } from '../types';

const toasts = ref<ToastMessage[]>([]);

export function useToast() {
  function showToast(message: string, type: ToastMessage['type'] = 'info', duration = 3000) {
    const id = 'toast_' + Date.now() + Math.random().toString(36).slice(2, 6);
    toasts.value.push({ id, type, message });
    setTimeout(() => {
      const idx = toasts.value.findIndex(t => t.id === id);
      if (idx !== -1) {
        toasts.value.splice(idx, 1);
      }
    }, duration);
  }

  function success(message: string) {
    showToast(message, 'success');
  }

  function error(message: string) {
    showToast(message, 'error');
  }

  function warning(message: string) {
    showToast(message, 'warning');
  }

  function info(message: string) {
    showToast(message, 'info');
  }

  return {
    toasts,
    showToast,
    success,
    error,
    warning,
    info,
  };
}
