/**
 * Module-level MLS operation lock.
 * Serializes all WASM calls across Chat.tsx and App.tsx so concurrent
 * encrypt/decrypt/addMember operations cannot corrupt ratchet state.
 */
let _lock: Promise<void> = Promise.resolve();

export function runMlsOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = _lock.then(fn, fn) as Promise<T>;
  _lock = next.then(() => {}, () => {});
  return next;
}
