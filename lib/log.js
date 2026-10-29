let on = false;

export let verbose = false;

export function setVerbose(v) {
  on = v === true;
  verbose = on;
}

export function log(...args) {
  if (!on) return;
  try {
    console.log("[porn]", ...args);
  } catch {

  }
}

export function warnOnce(key, ...args) {
  try {
    const set = (globalThis.__pornWarned ??= new Set());
    if (set.has(key)) return;
    set.add(key);
    console.warn("[porn]", ...args);
  } catch {

  }
}
