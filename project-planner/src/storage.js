const KEY = 'project-planner:v1';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.projects)) return s;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { projects: [], activeId: null };
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable */
  }
}
