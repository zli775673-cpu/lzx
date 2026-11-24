// Tasks are stored flat: { id, title, notes, status, priority, parentId, order, dependsOn: [] }

export const STATUSES = ['todo', 'in-progress', 'blocked', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const STATUS_LABEL = { todo: 'To do', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' };

export const childrenOf = (tasks, parentId) =>
  tasks.filter((t) => (t.parentId ?? null) === parentId).sort((a, b) => a.order - b.order);

export function descendantIds(tasks, id) {
  const out = new Set();
  const walk = (pid) => {
    for (const t of tasks) if (t.parentId === pid && !out.has(t.id)) { out.add(t.id); walk(t.id); }
  };
  walk(id);
  return out;
}

// Depth-first ordered list with outline numbers, e.g. 1, 1.1, 1.2, 2
export function flatten(tasks, parentId = null, prefix = '', depth = 0) {
  const rows = [];
  childrenOf(tasks, parentId).forEach((t, i) => {
    const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    rows.push({ task: t, num, depth });
    rows.push(...flatten(tasks, t.id, num, depth + 1));
  });
  return rows;
}

// Completion of a task = share of its leaf descendants that are done (or itself if leaf).
export function progress(tasks, id) {
  const kids = tasks.filter((t) => t.parentId === id);
  if (kids.length === 0) {
    const t = tasks.find((x) => x.id === id);
    return { done: t?.status === 'done' ? 1 : 0, total: 1 };
  }
  return kids.reduce(
    (acc, k) => {
      const p = progress(tasks, k.id);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 }
  );
}

// Move task `dragId` relative to `targetId`: 'before' | 'after' | 'inside'.
export function moveTask(tasks, dragId, targetId, where) {
  if (dragId === targetId) return tasks;
  if (descendantIds(tasks, dragId).has(targetId)) return tasks; // no cycles
  const target = tasks.find((t) => t.id === targetId);
  const newParent = where === 'inside' ? targetId : target.parentId ?? null;
  const siblings = childrenOf(tasks, newParent).filter((t) => t.id !== dragId);
  let idx = where === 'inside' ? siblings.length : siblings.findIndex((t) => t.id === targetId);
  if (where === 'after') idx += 1;
  const dragged = tasks.find((t) => t.id === dragId);
  siblings.splice(idx, 0, dragged);
  const orderMap = new Map(siblings.map((t, i) => [t.id, i]));
  return tasks.map((t) =>
    t.id === dragId
      ? { ...t, parentId: newParent, order: orderMap.get(t.id) }
      : orderMap.has(t.id)
        ? { ...t, order: orderMap.get(t.id) }
        : t
  );
}

// Swap a task with its previous/next sibling (keyboard-friendly alternative to drag and drop).
export function shiftTask(tasks, id, dir) {
  const t = tasks.find((x) => x.id === id);
  const sibs = childrenOf(tasks, t.parentId ?? null);
  const i = sibs.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return tasks;
  return moveTask(tasks, id, sibs[j].id, dir < 0 ? 'before' : 'after');
}

// Indent: become last child of previous sibling. Outdent: become next sibling of parent.
export function indentTask(tasks, id) {
  const t = tasks.find((x) => x.id === id);
  const sibs = childrenOf(tasks, t.parentId ?? null);
  const i = sibs.findIndex((x) => x.id === id);
  if (i <= 0) return tasks;
  return moveTask(tasks, id, sibs[i - 1].id, 'inside');
}

export function outdentTask(tasks, id) {
  const t = tasks.find((x) => x.id === id);
  if (!t.parentId) return tasks;
  return moveTask(tasks, id, t.parentId, 'after');
}

export function deleteTask(tasks, id) {
  const gone = descendantIds(tasks, id);
  gone.add(id);
  return tasks
    .filter((t) => !gone.has(t.id))
    .map((t) => ({ ...t, dependsOn: (t.dependsOn || []).filter((d) => !gone.has(d)) }));
}
