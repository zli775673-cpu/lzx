import { useEffect, useMemo, useState } from 'react';
import { loadState, saveState, uid } from './storage.js';
import {
  STATUSES, PRIORITIES, STATUS_LABEL, childrenOf, flatten, progress,
  moveTask, shiftTask, indentTask, outdentTask, deleteTask, descendantIds,
} from './tasks.js';

export default function App() {
  const [state, setState] = useState(loadState);
  useEffect(() => saveState(state), [state]);

  const active = state.projects.find((p) => p.id === state.activeId) || null;

  const updateProject = (id, fn) =>
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) }));

  const createProject = (title, description) => {
    const p = { id: uid(), title, description, createdAt: Date.now(), tasks: [] };
    setState((s) => ({ projects: [...s.projects, p], activeId: p.id }));
  };

  const deleteProject = (id) => {
    if (!confirm('Delete this project and all its tasks?')) return;
    setState((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      return { projects, activeId: s.activeId === id ? projects[0]?.id ?? null : s.activeId };
    });
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Project Planner</h1>
        <h2>Projects</h2>
        <ul className="project-list">
          {state.projects.map((p) => {
            const pr = projectProgress(p.tasks);
            return (
              <li key={p.id} className={p.id === state.activeId ? 'active' : ''}>
                <button className="link" onClick={() => setState((s) => ({ ...s, activeId: p.id }))}>
                  <span className="pname">{p.title}</span>
                  <span className="muted small">{p.tasks.length} tasks · {pr}%</span>
                </button>
              </li>
            );
          })}
          {state.projects.length === 0 && <li className="muted small">No projects yet.</li>}
        </ul>
        <button className="primary block" onClick={() => setState((s) => ({ ...s, activeId: null }))}>
          + New project
        </button>
      </aside>

      <main className="main">
        {active ? (
          <ProjectView
            key={active.id}
            project={active}
            onChange={(fn) => updateProject(active.id, fn)}
            onDelete={() => deleteProject(active.id)}
          />
        ) : (
          <NewProjectForm onCreate={createProject} />
        )}
      </main>
    </div>
  );
}

function projectProgress(tasks) {
  const roots = tasks.filter((t) => !t.parentId);
  if (!roots.length) return 0;
  let done = 0, total = 0;
  for (const r of roots) {
    const p = progress(tasks, r.id);
    done += p.done; total += p.total;
  }
  return Math.round((done / total) * 100);
}

function NewProjectForm({ onCreate }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <form
      className="card new-project"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onCreate(title.trim(), desc.trim());
      }}
    >
      <h2>Start a new project</h2>
      <p className="muted">Give your idea a name and a short description, then break it down into tasks.</p>
      <label>
        Title
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch a personal blog" />
      </label>
      <label>
        Description
        <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this project about?" />
      </label>
      <button className="primary" type="submit" disabled={!title.trim()}>Create project</button>
    </form>
  );
}

function ProjectView({ project, onChange, onDelete }) {
  const [editingHeader, setEditingHeader] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [addingUnder, setAddingUnder] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [drag, setDrag] = useState(null); // { id, overId, where }

  const tasks = project.tasks;
  const rows = useMemo(() => flatten(tasks), [tasks]);
  const numById = useMemo(() => Object.fromEntries(rows.map((r) => [r.task.id, r.num])), [rows]);

  const setTasks = (fn) => onChange((p) => ({ ...p, tasks: fn(p.tasks) }));

  const addTask = (title, parentId = null) => {
    setTasks((ts) => [
      ...ts,
      {
        id: uid(), title, notes: '', status: 'todo', priority: 'medium',
        parentId, order: childrenOf(ts, parentId).length, dependsOn: [],
      },
    ]);
    if (parentId) setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
  };

  const patchTask = (id, patch) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // hide rows under collapsed parents
  const visible = [];
  const hiddenUnder = new Set();
  for (const r of rows) {
    if (r.task.parentId && hiddenUnder.has(r.task.parentId)) { hiddenUnder.add(r.task.id); continue; }
    visible.push(r);
    if (collapsed.has(r.task.id)) hiddenUnder.add(r.task.id);
  }

  const counts = STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]);
  const pct = projectProgress(tasks);

  const onDragOver = (e, id) => {
    if (!drag) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    const where = y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside';
    if (drag.overId !== id || drag.where !== where) setDrag({ ...drag, overId: id, where });
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (drag?.overId) setTasks((ts) => moveTask(ts, drag.id, drag.overId, drag.where));
    setDrag(null);
  };

  return (
    <div>
      <section className="card header">
        {editingHeader ? (
          <HeaderEditor
            project={project}
            onSave={(title, description) => { onChange((p) => ({ ...p, title, description })); setEditingHeader(false); }}
            onCancel={() => setEditingHeader(false)}
          />
        ) : (
          <>
            <div className="row space">
              <h2 className="ptitle">{project.title}</h2>
              <div className="row gap">
                <button onClick={() => setEditingHeader(true)}>Edit</button>
                <button className="danger" onClick={onDelete}>Delete project</button>
              </div>
            </div>
            {project.description && <p className="desc">{project.description}</p>}
          </>
        )}
        <div className="summary">
          <div className="bar" title={`${pct}% complete`}><div style={{ width: `${pct}%` }} /></div>
          <span className="small"><b>{pct}%</b> complete · {tasks.length} tasks</span>
          {counts.map(([s, n]) => (
            <span key={s} className={`pill status-${s}`}>{STATUS_LABEL[s]}: {n}</span>
          ))}
        </div>
      </section>

      <section className="card">
        <form
          className="row gap"
          onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) { addTask(newTitle.trim()); setNewTitle(''); } }}
        >
          <input className="grow" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a top-level task…" />
          <button className="primary" type="submit" disabled={!newTitle.trim()}>Add task</button>
        </form>

        {tasks.length > 0 && (
          <div className="row gap toolbar">
            <button onClick={() => setCollapsed(new Set())}>Expand all</button>
            <button onClick={() => setCollapsed(new Set(tasks.filter((t) => tasks.some((c) => c.parentId === t.id)).map((t) => t.id)))}>Collapse all</button>
            <span className="muted small">Drag ⠿ to reorder: drop on the top/bottom edge of a task to place before/after it, or the middle to nest it.</span>
          </div>
        )}

        <ul className="tree" onDragEnd={() => setDrag(null)}>
          {visible.map(({ task, num, depth }) => {
            const hasKids = tasks.some((t) => t.parentId === task.id);
            const pr = hasKids ? progress(tasks, task.id) : null;
            const deps = (task.dependsOn || []).map((d) => tasks.find((t) => t.id === d)).filter(Boolean);
            const waiting = deps.filter((d) => d.status !== 'done');
            const dropCls = drag?.overId === task.id ? `drop-${drag.where}` : '';
            return (
              <li key={task.id} style={{ '--depth': depth }}>
                <div
                  className={`task prio-${task.priority} ${task.status === 'done' ? 'is-done' : ''} ${dropCls} ${drag?.id === task.id ? 'dragging' : ''}`}
                  onDragOver={(e) => onDragOver(e, task.id)}
                  onDrop={onDrop}
                >
                  <span
                    className="handle"
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); setDrag({ id: task.id }); }}
                    title="Drag to move"
                  >⠿</span>
                  <button
                    className={`toggle ${hasKids ? '' : 'invisible'}`}
                    onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; })}
                    aria-label={collapsed.has(task.id) ? 'Expand' : 'Collapse'}
                  >{collapsed.has(task.id) ? '▸' : '▾'}</button>
                  <span className="num">{num}</span>
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={(e) => patchTask(task.id, { status: e.target.checked ? 'done' : 'todo' })}
                    title="Mark done"
                  />
                  <div className="tmain">
                    <span className="ttitle">{task.title}</span>
                    {task.notes && <span className="notes">{task.notes}</span>}
                    <span className="meta">
                      {pr && <span className="small muted">{pr.done}/{pr.total} subtasks done</span>}
                      {deps.length > 0 && (
                        <span className={`dep ${waiting.length ? 'dep-wait' : 'dep-ok'}`} title={deps.map((d) => `${numById[d.id]} ${d.title}`).join('\n')}>
                          {waiting.length ? '⛔ waits on ' : '✓ after '}
                          {deps.map((d) => numById[d.id]).join(', ')}
                        </span>
                      )}
                    </span>
                  </div>
                  <select className={`status status-${task.status}`} value={task.status} onChange={(e) => patchTask(task.id, { status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <select className={`prio prio-sel-${task.priority}`} value={task.priority} onChange={(e) => patchTask(task.id, { priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div className="actions">
                    <button title="Add subtask" onClick={() => setAddingUnder(task.id)}>+ Sub</button>
                    <button title="Edit" onClick={() => setEditingId(task.id)}>Edit</button>
                    <button title="Move up" onClick={() => setTasks((ts) => shiftTask(ts, task.id, -1))}>↑</button>
                    <button title="Move down" onClick={() => setTasks((ts) => shiftTask(ts, task.id, 1))}>↓</button>
                    <button title="Outdent" onClick={() => setTasks((ts) => outdentTask(ts, task.id))}>←</button>
                    <button title="Indent (make subtask of previous)" onClick={() => setTasks((ts) => indentTask(ts, task.id))}>→</button>
                    <button
                      className="danger"
                      title="Delete"
                      onClick={() => {
                        const n = descendantIds(tasks, task.id).size;
                        if (!n || confirm(`Delete "${task.title}" and its ${n} subtask(s)?`)) setTasks((ts) => deleteTask(ts, task.id));
                      }}
                    >✕</button>
                  </div>
                </div>
                {addingUnder === task.id && (
                  <InlineAdd
                    depth={depth + 1}
                    onAdd={(title) => addTask(title, task.id)}
                    onClose={() => setAddingUnder(null)}
                  />
                )}
                {editingId === task.id && (
                  <TaskEditor
                    task={task}
                    tasks={tasks}
                    numById={numById}
                    onSave={(patch) => { patchTask(task.id, patch); setEditingId(null); }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {tasks.length === 0 && <p className="muted empty">No tasks yet. Add your first one above, then break it into subtasks with “+ Sub”.</p>}
      </section>
    </div>
  );
}

function HeaderEditor({ project, onSave, onCancel }) {
  const [title, setTitle] = useState(project.title);
  const [desc, setDesc] = useState(project.description);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave(title.trim(), desc.trim()); }}>
      <label>Title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Description<textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      <div className="row gap">
        <button className="primary" type="submit">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function InlineAdd({ depth, onAdd, onClose }) {
  const [title, setTitle] = useState('');
  return (
    <form
      className="row gap inline-add"
      style={{ '--depth': depth }}
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle(''); } }}
    >
      <input autoFocus className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Subtask title (Enter to add, Esc to close)" onKeyDown={(e) => e.key === 'Escape' && onClose()} />
      <button className="primary" type="submit" disabled={!title.trim()}>Add</button>
      <button type="button" onClick={onClose}>Done</button>
    </form>
  );
}

function TaskEditor({ task, tasks, numById, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || '');
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [dependsOn, setDependsOn] = useState(task.dependsOn || []);
  // can't depend on itself or its own subtasks
  const blocked = descendantIds(tasks, task.id);
  blocked.add(task.id);
  const options = flatten(tasks).filter((r) => !blocked.has(r.task.id));

  return (
    <form className="editor stack" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), notes: notes.trim(), status, priority, dependsOn }); }}>
      <label>Title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Notes<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="row gap">
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label>Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      {options.length > 0 && (
        <fieldset>
          <legend>Depends on (must finish first)</legend>
          <div className="deps">
            {options.map(({ task: t }) => (
              <label key={t.id} className="check">
                <input
                  type="checkbox"
                  checked={dependsOn.includes(t.id)}
                  onChange={(e) => setDependsOn((d) => (e.target.checked ? [...d, t.id] : d.filter((x) => x !== t.id)))}
                />
                {numById[t.id]} {t.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="row gap">
        <button className="primary" type="submit">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
