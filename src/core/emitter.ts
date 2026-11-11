/** Tiny typed event emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<(v: never) => void>>();
  on<K extends keyof E>(type: K, fn: (v: E[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as (v: never) => void);
    return () => set.delete(fn as (v: never) => void);
  }
  emit<K extends keyof E>(type: K, value: E[K]): void {
    this.handlers.get(type)?.forEach((fn) => (fn as (v: E[K]) => void)(value));
  }
  clear(): void {
    this.handlers.clear();
  }
}
