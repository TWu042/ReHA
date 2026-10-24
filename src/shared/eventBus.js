const listeners = {};

export const eventBus = {
  on(type, fn) {
    (listeners[type] ||= []).push(fn);

    return () => {
      listeners[type] = listeners[type].filter(f => f !== fn);
    };
  },

  emit(type, data) {
    (listeners[type] || []).forEach(fn => fn(data));
  },
};