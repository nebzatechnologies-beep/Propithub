export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onClick: (e: React.MouseEvent) => void;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  duration?: number;
  action?: ToastAction;
  type?: ToastType;
}

export interface ToastItem {
  id: string;
  msg: string;
  title?: string;
  type: ToastType;
  duration: number;
  createdAt: number;
  action?: ToastAction;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private timers: Map<string, number> = new Map();

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const list = [...this.toasts];
    this.listeners.forEach((listener) => listener(list));
  }

  private autoDetectType(msg: string): ToastType {
    const lower = msg.toLowerCase();
    if (msg.startsWith('✓') || lower.includes('success') || lower.includes('confirmed') || lower.includes('saved') || lower.includes('downloaded') || lower.includes('dispatched') || lower.includes('accepted')) {
      return 'success';
    }
    if (lower.includes('failed') || lower.includes('error') || lower.includes('could not') || lower.includes('invalid') || lower.includes('denied') || lower.includes('exception')) {
      return 'error';
    }
    if (lower.includes('please') || lower.includes('warning') || lower.includes('only') || lower.includes('cannot') || lower.includes('not found') || lower.includes('required')) {
      return 'warning';
    }
    return 'info';
  }

  show(msg: string, options?: ToastOptions): string {
    const id = options?.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const type = options?.type || this.autoDetectType(msg);
    const duration = options?.duration !== undefined 
      ? options.duration 
      : type === 'loading' 
        ? 0 
        : type === 'error' 
          ? 5500 
          : 4000;

    // Clean up symbol prefixes from text if already included
    const cleanMsg = msg.replace(/^[✓⚠️ℹ️⚗️]\s*/, '').trim();

    const newToast: ToastItem = {
      id,
      msg: cleanMsg || msg,
      title: options?.title,
      type,
      duration,
      createdAt: Date.now(),
      action: options?.action,
    };

    // If an existing toast with same id exists, replace it
    const existingIndex = this.toasts.findIndex((t) => t.id === id);
    if (existingIndex >= 0) {
      this.toasts[existingIndex] = newToast;
    } else {
      // Keep max 5 toasts visible at once
      if (this.toasts.length >= 5) {
        const removed = this.toasts.shift();
        if (removed && this.timers.has(removed.id)) {
          clearTimeout(this.timers.get(removed.id));
          this.timers.delete(removed.id);
        }
      }
      this.toasts.push(newToast);
    }

    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    if (duration > 0) {
      const timer = window.setTimeout(() => {
        this.dismiss(id);
      }, duration);
      this.timers.set(id, timer);
    }

    this.notify();
    return id;
  }

  success(msg: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(msg, { ...options, type: 'success' });
  }

  error(msg: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(msg, { ...options, type: 'error' });
  }

  warning(msg: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(msg, { ...options, type: 'warning' });
  }

  info(msg: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(msg, { ...options, type: 'info' });
  }

  loading(msg: string, options?: Omit<ToastOptions, 'type'>): string {
    return this.show(msg, { ...options, type: 'loading', duration: 0 });
  }

  async promise<T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: any) => string);
    },
    options?: Omit<ToastOptions, 'type'>
  ): Promise<T> {
    const id = this.loading(msgs.loading, options);
    try {
      const data = await promise;
      const successMsg = typeof msgs.success === 'function' ? msgs.success(data) : msgs.success;
      this.success(successMsg, { ...options, id });
      return data;
    } catch (err: any) {
      const errorMsg = typeof msgs.error === 'function' ? msgs.error(err) : msgs.error;
      this.error(errorMsg, { ...options, id });
      throw err;
    }
  }

  dismiss(id: string) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.toasts = [];
    this.notify();
  }
}

export const toast = new ToastManager();
