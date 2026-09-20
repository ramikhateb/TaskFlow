/**
 * Dev-only logging. Errors always print in `__DEV__`.
 * Never log secrets (tokens, passwords).
 */
export function logError(tag: string, message: string, extra?: unknown): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (extra !== undefined) {
    console.error(`[${tag}] ${message}`, extra);
  } else {
    console.error(`[${tag}] ${message}`);
  }
}
