const pauseHandlers = new Set<() => void>();

export function registerMediaPauseHandler(handler: () => void) {
  pauseHandlers.add(handler);
  return () => {
    pauseHandlers.delete(handler);
  };
}

export function pauseAllMedia() {
  for (const handler of pauseHandlers) {
    try {
      handler();
    } catch {
      // keep call navigation resilient
    }
  }
}