import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import { store } from './lib/store.js'

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6) // 6am - 9pm
const LONG_PRESS_MS = 500

const CANVAS_SIZE = 3000
const HALF = CANVAS_SIZE / 2
const ZONES = [
  { id: 'work',     name: 'work',     x: 0,    y: 0,    w: HALF, h: HALF, tint: 'rgba(139, 92, 60, 0.06)',  accent: '#8b5c3c' },
  { id: 'personal', name: 'personal', x: HALF, y: 0,    w: HALF, h: HALF, tint: 'rgba(74, 109, 130, 0.07)', accent: '#4a6d82' },
  { id: 'ideas',    name: 'ideas',    x: 0,    y: HALF, w: HALF, h: HALF, tint: 'rgba(170, 138, 50, 0.07)', accent: '#aa8a32' },
  { id: 'someday',  name: 'someday',  x: HALF, y: HALF, w: HALF, h: HALF, tint: 'rgba(168, 101, 104, 0.06)',accent: '#a86568' },
]
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2

function zoneForPoint(x, y) {
  return ZONES.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) || ZONES[0]
}

function fmtDate() {
  const d = new Date()
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}${ampm}`
}

// Long-press detection that doesn't fight dnd-kit's drag activation.
function useLongPress(onLongPress) {
  const timer = useRef(null)
  const startPos = useRef(null)

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    startPos.current = null
  }, [])

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return
    startPos.current = { x: e.clientX, y: e.clientY }
    timer.current = setTimeout(() => onLongPress(e), LONG_PRESS_MS)
  }, [onLongPress])

  const onPointerMove = useCallback((e) => {
    if (!startPos.current || !timer.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (dx * dx + dy * dy > 36) { clearTimeout(timer.current); timer.current = null }
  }, [])

  const onPointerUp = useCallback(() => { clear() }, [clear])
  const onPointerCancel = useCallback(() => { clear() }, [clear])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}

// ---------- CANVAS PAGE ----------

function CanvasStone({ task, viewport, onLongPress }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { source: 'canvas' }
  })
  const longPress = useLongPress(() => onLongPress(task))

  const zone = zoneForPoint(task.x ?? 0, task.y ?? 0)

  // Stone is positioned in canvas coords. The canvas itself is transformed by the
  // viewport, so absolute coords inside it are already in canvas-space.
  const style = {
    left: task.x,
    top: task.y,
    // dnd-kit's transform.x/y are in screen pixels; we need to compensate for zoom
    // so the stone follows the finger.
    transform: transform ? `translate3d(${transform.x / viewport.zoom}px, ${transform.y / viewport.zoom}px, 0)` : undefined,
    borderLeftColor: zone.accent
  }

  const merged = {
    ...listeners,
    onPointerDown: (e) => { listeners?.onPointerDown?.(e); longPress.onPointerDown(e) },
    onPointerMove: (e) => { listeners?.onPointerMove?.(e); longPress.onPointerMove(e) },
    onPointerUp:   (e) => { listeners?.onPointerUp?.(e);   longPress.onPointerUp(e) },
    onPointerCancel:(e)=> { listeners?.onPointerCancel?.(e); longPress.onPointerCancel(e) },
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-stone ${isDragging ? 'dragging' : ''} ${task.scheduled_hour != null ? 'scheduled' : ''}`}
      {...attributes}
      {...merged}
    >
      <div className="title">{task.title}</div>
      <div className="meta">
        {task.scheduled_hour != null ? `${fmtHour(task.scheduled_hour)} · ${zone.name}` : zone.name}
      </div>
    </div>
  )
}

function ZoneBackground({ zone }) {
  return (
    <div className="zone-bg" style={{
      left: zone.x, top: zone.y, width: zone.w, height: zone.h,
      background: zone.tint, color: zone.accent
    }}>
      <div className="zone-label">{zone.name}</div>
    </div>
  )
}

function Minimap({ viewport, viewportPx, tasks, onJump }) {
  const SIZE = 120
  const scale = SIZE / CANVAS_SIZE
  const ref = useRef(null)

  const handleTap = (e) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const tx = (e.clientX - rect.left) / scale
    const ty = (e.clientY - rect.top) / scale
    // Center the viewport on the tapped point.
    onJump({
      x: tx - (viewportPx.w / viewport.zoom) / 2,
      y: ty - (viewportPx.h / viewport.zoom) / 2,
      zoom: viewport.zoom
    })
  }

  return (
    <div className="minimap" ref={ref} onClick={handleTap}>
      {ZONES.map(z => (
        <div key={z.id} className="minimap-zone" style={{
          left: z.x * scale, top: z.y * scale, width: z.w * scale, height: z.h * scale,
          background: z.tint
        }} />
      ))}
      {tasks.map(t => (
        <div key={t.id} className="minimap-dot" style={{
          left: (t.x ?? 0) * scale, top: (t.y ?? 0) * scale,
          background: zoneForPoint(t.x ?? 0, t.y ?? 0).accent
        }} />
      ))}
      <div className="minimap-viewport" style={{
        left: viewport.x * scale,
        top: viewport.y * scale,
        width: (viewportPx.w / viewport.zoom) * scale,
        height: (viewportPx.h / viewport.zoom) * scale,
      }} />
    </div>
  )
}

function CanvasPage({ tasks, setTasks, onAdd, onLongPress }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 }) // canvas coord at top-left, plus zoom
  const [viewportPx, setViewportPx] = useState({ w: 360, h: 600 })
  const panRef = useRef(null)
  const pinchRef = useRef(null)

  useEffect(() => {
    const updateSize = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) setViewportPx({ w: rect.width, h: rect.height })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const clampViewport = (v) => {
    const visW = viewportPx.w / v.zoom
    const visH = viewportPx.h / v.zoom
    return {
      ...v,
      x: Math.max(-100, Math.min(CANVAS_SIZE - visW + 100, v.x)),
      y: Math.max(-100, Math.min(CANVAS_SIZE - visH + 100, v.y)),
    }
  }

  const handleDragEnd = async (event) => {
    const { active, delta } = event
    const task = tasks.find(t => t.id === active.id)
    if (!task) return
    // delta is screen-pixels; convert to canvas-pixels by dividing by zoom
    const newX = Math.max(0, Math.min(CANVAS_SIZE - 180, (task.x || 0) + delta.x / viewport.zoom))
    const newY = Math.max(0, Math.min(CANVAS_SIZE - 80,  (task.y || 0) + delta.y / viewport.zoom))
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, x: newX, y: newY } : t))
    await store.update(task.id, { x: newX, y: newY })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  // ---- Pan / pinch handlers on the canvas container ----
  // Only pan when the touch starts on empty canvas (not on a stone). When it starts
  // on a stone, dnd-kit handles dragging via its own listeners.
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      if (e.target.closest('.task-stone')) return // dnd-kit will handle
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        origX: viewport.x,
        origY: viewport.y,
      }
    } else if (e.touches.length === 2) {
      panRef.current = null
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      pinchRef.current = {
        startDist: dist,
        startZoom: viewport.zoom,
        midX, midY,
        origX: viewport.x,
        origY: viewport.y,
      }
    }
  }

  const onTouchMove = (e) => {
    if (e.touches.length === 1 && panRef.current) {
      const dx = e.touches[0].clientX - panRef.current.startX
      const dy = e.touches[0].clientY - panRef.current.startY
      setViewport(v => clampViewport({
        ...v,
        x: panRef.current.origX - dx / v.zoom,
        y: panRef.current.origY - dy / v.zoom,
      }))
    } else if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / pinchRef.current.startDist
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.startZoom * ratio))
      // Keep the midpoint between fingers stable in canvas space.
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const midScreenX = pinchRef.current.midX - rect.left
      const midScreenY = pinchRef.current.midY - rect.top
      const midCanvasX = pinchRef.current.origX + midScreenX / pinchRef.current.startZoom
      const midCanvasY = pinchRef.current.origY + midScreenY / pinchRef.current.startZoom
      setViewport(clampViewport({
        x: midCanvasX - midScreenX / newZoom,
        y: midCanvasY - midScreenY / newZoom,
        zoom: newZoom,
      }))
    }
  }

  const onTouchEnd = () => { panRef.current = null; pinchRef.current = null }

  const jumpToZone = (zone) => {
    // Center the zone in the viewport at zoom 1
    setViewport(clampViewport({
      x: zone.x + zone.w / 2 - viewportPx.w / 2,
      y: zone.y + zone.h / 2 - viewportPx.h / 2,
      zoom: 1,
    }))
  }

  const transformStyle = {
    transform: `translate3d(${-viewport.x * viewport.zoom}px, ${-viewport.y * viewport.zoom}px, 0) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
  }

  return (
    <div className="page">
      <div className="zone-chips">
        {ZONES.map(z => (
          <button key={z.id} className="zone-chip" style={{ color: z.accent, borderColor: z.accent + '55' }}
            onClick={() => jumpToZone(z)}>
            {z.name}
          </button>
        ))}
      </div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          className="canvas-container"
          ref={containerRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="canvas" ref={canvasRef} style={transformStyle}>
            {ZONES.map(z => <ZoneBackground key={z.id} zone={z} />)}
            {tasks.map(task => (
              <CanvasStone key={task.id} task={task} viewport={viewport} onLongPress={onLongPress} />
            ))}
            {tasks.length === 0 && (
              <div className="empty" style={{ position: 'absolute', left: viewport.x + viewportPx.w / 2 - 120, top: viewport.y + viewportPx.h / 2 - 60, width: 240 }}>
                <h3>nothing yet.</h3>
                <p>tap + to drop your first stone.</p>
              </div>
            )}
          </div>
        </div>
      </DndContext>
      <Minimap viewport={viewport} viewportPx={viewportPx} tasks={tasks} onJump={(v) => setViewport(clampViewport(v))} />
      <button className="fab" onClick={() => onAdd(viewport, viewportPx)} aria-label="Add task">+</button>
    </div>
  )
}

// ---------- CALENDAR PAGE ----------

function TimeSlot({ hour, tasks, onLongPress }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${hour}`, data: { hour } })
  return (
    <div ref={setNodeRef} className={`cal-row ${isOver ? 'over' : ''}`}>
      <div className="cal-time">{fmtHour(hour)}</div>
      <div className="cal-slot">
        {tasks.map(t => <CalendarTask key={t.id} task={t} onLongPress={onLongPress} />)}
      </div>
    </div>
  )
}

function CalendarTask({ task, onLongPress }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id, data: { source: 'calendar' }
  })
  const longPress = useLongPress(() => onLongPress(task))
  const zone = zoneForPoint(task.x ?? 0, task.y ?? 0)
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    background: zone.accent
  }
  const merged = {
    ...listeners,
    onPointerDown: (e) => { listeners?.onPointerDown?.(e); longPress.onPointerDown(e) },
    onPointerMove: (e) => { listeners?.onPointerMove?.(e); longPress.onPointerMove(e) },
    onPointerUp:   (e) => { listeners?.onPointerUp?.(e);   longPress.onPointerUp(e) },
    onPointerCancel:(e)=> { listeners?.onPointerCancel?.(e); longPress.onPointerCancel(e) },
  }
  return (
    <div ref={setNodeRef} style={style} className="cal-task" {...attributes} {...merged}>
      {task.title}
    </div>
  )
}

function TrayTask({ task, onLongPress }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id, data: { source: 'tray' }
  })
  const longPress = useLongPress(() => onLongPress(task))
  const zone = zoneForPoint(task.x ?? 0, task.y ?? 0)
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    borderLeftColor: zone.accent
  }
  const merged = {
    ...listeners,
    onPointerDown: (e) => { listeners?.onPointerDown?.(e); longPress.onPointerDown(e) },
    onPointerMove: (e) => { listeners?.onPointerMove?.(e); longPress.onPointerMove(e) },
    onPointerUp:   (e) => { listeners?.onPointerUp?.(e);   longPress.onPointerUp(e) },
    onPointerCancel:(e)=> { listeners?.onPointerCancel?.(e); longPress.onPointerCancel(e) },
  }
  return (
    <div ref={setNodeRef} style={style} className="tray-task" {...attributes} {...merged}>
      {task.title}
    </div>
  )
}

function UnscheduledTray({ tasks, onLongPress }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' })
  return (
    <div ref={setNodeRef} className="tray" style={isOver ? { background: 'rgba(138,58,44,0.06)' } : undefined}>
      <div className="tray-label">Unscheduled</div>
      {tasks.length === 0 && <div className="tray-label" style={{ color: 'var(--ink-faint)' }}>drag here to unschedule</div>}
      {tasks.map(t => <TrayTask key={t.id} task={t} onLongPress={onLongPress} />)}
    </div>
  )
}

function CalendarPage({ tasks, setTasks, onLongPress }) {
  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return
    const taskId = active.id
    let patch = null
    if (over.id === 'tray') patch = { scheduled_hour: null }
    else if (typeof over.id === 'string' && over.id.startsWith('slot-')) patch = { scheduled_hour: Number(over.id.slice(5)) }
    if (!patch) return
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
    await store.update(taskId, patch)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  const unscheduled = tasks.filter(t => t.scheduled_hour == null)
  const byHour = HOURS.map(h => ({ hour: h, items: tasks.filter(t => t.scheduled_hour === h) }))

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="page">
        <div className="calendar">
          {byHour.map(({ hour, items }) => (
            <TimeSlot key={hour} hour={hour} tasks={items} onLongPress={onLongPress} />
          ))}
        </div>
        <UnscheduledTray tasks={unscheduled} onLongPress={onLongPress} />
      </div>
    </DndContext>
  )
}

// ---------- MODALS ----------

function AddModal({ onClose, onCreate, defaultZone }) {
  const [title, setTitle] = useState('')
  const [zoneId, setZoneId] = useState(defaultZone?.id ?? 'work')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate(trimmed, zoneId)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>new stone</h2>
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="what needs doing?"
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <div className="zone-picker">
          {ZONES.map(z => (
            <button
              key={z.id}
              className={`zone-pick ${zoneId === z.id ? 'active' : ''}`}
              style={{ color: z.accent, borderColor: zoneId === z.id ? z.accent : 'var(--line)' }}
              onClick={() => setZoneId(z.id)}
            >
              {z.name}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>cancel</button>
          <button className="btn btn-primary" onClick={submit}>add</button>
        </div>
      </div>
    </div>
  )
}

function TaskDetailModal({ task, onClose, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [title, setTitle] = useState(task.title)
  const inputRef = useRef(null)
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const zone = zoneForPoint(task.x ?? 0, task.y ?? 0)

  const saveTitle = async () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) await onUpdate({ title: trimmed })
    setEditing(false)
  }
  const unschedule = async () => { await onUpdate({ scheduled_hour: null }); onClose() }
  const moveToZone = async (z) => {
    await onUpdate({ x: z.x + z.w / 2 - 90, y: z.y + z.h / 2 - 30 })
  }
  const doDelete = async () => { await onDelete(); onClose() }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {editing ? (
          <>
            <h2>edit stone</h2>
            <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveTitle()} />
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => { setTitle(task.title); setEditing(false) }}>cancel</button>
              <button className="btn btn-primary" onClick={saveTitle}>save</button>
            </div>
          </>
        ) : (
          <>
            <h2>{task.title}</h2>
            <div className="detail-meta" style={{ color: zone.accent }}>
              {task.scheduled_hour != null ? `${fmtHour(task.scheduled_hour)} · ` : ''}{zone.name}
            </div>
            <div className="detail-row-label">move to zone</div>
            <div className="zone-picker">
              {ZONES.map(z => (
                <button key={z.id} className={`zone-pick ${z.id === zone.id ? 'active' : ''}`}
                  style={{ color: z.accent, borderColor: z.id === zone.id ? z.accent : 'var(--line)' }}
                  onClick={() => moveToZone(z)}>
                  {z.name}
                </button>
              ))}
            </div>
            <div className="detail-actions">
              <button className="btn btn-ghost detail-btn" onClick={() => setEditing(true)}>edit</button>
              {task.scheduled_hour != null && (
                <button className="btn btn-ghost detail-btn" onClick={unschedule}>unschedule</button>
              )}
              {confirmingDelete ? (
                <>
                  <button className="btn btn-ghost detail-btn" onClick={() => setConfirmingDelete(false)}>cancel</button>
                  <button className="btn btn-danger detail-btn" onClick={doDelete}>confirm delete</button>
                </>
              ) : (
                <button className="btn btn-danger detail-btn" onClick={() => setConfirmingDelete(true)}>delete</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- APP ----------

export default function App() {
  const [tasks, setTasks] = useState([])
  const [tab, setTab] = useState('canvas')
  const [addContext, setAddContext] = useState(null) // { viewport, viewportPx } when add is open
  const [detailTask, setDetailTask] = useState(null)

  useEffect(() => { store.list().then(setTasks) }, [])

  const handleCreate = async (title, zoneId) => {
    const zone = ZONES.find(z => z.id === zoneId) || ZONES[0]
    // place near the center of the chosen zone, with a small random jitter
    const jitterX = Math.floor(Math.random() * 120) - 60
    const jitterY = Math.floor(Math.random() * 120) - 60
    const x = zone.x + zone.w / 2 - 90 + jitterX
    const y = zone.y + zone.h / 2 - 30 + jitterY
    const created = await store.create({ title, x, y })
    setTasks(prev => [created, ...prev])
    setAddContext(null)
  }

  const handleUpdate = async (patch) => {
    if (!detailTask) return
    setTasks(prev => prev.map(t => t.id === detailTask.id ? { ...t, ...patch } : t))
    setDetailTask(prev => prev ? { ...prev, ...patch } : null)
    await store.update(detailTask.id, patch)
  }

  const handleDelete = async () => {
    if (!detailTask) return
    setTasks(prev => prev.filter(t => t.id !== detailTask.id))
    await store.remove(detailTask.id)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">stone.</div>
        <div className="date">{fmtDate()}</div>
      </header>

      {tab === 'canvas'
        ? <CanvasPage tasks={tasks} setTasks={setTasks} onAdd={(vp, vpPx) => setAddContext({ vp, vpPx })} onLongPress={setDetailTask} />
        : <CalendarPage tasks={tasks} setTasks={setTasks} onLongPress={setDetailTask} />}

      <nav className="tabs">
        <button className={`tab ${tab === 'canvas' ? 'active' : ''}`} onClick={() => setTab('canvas')}>Canvas</button>
        <button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
      </nav>

      {addContext && (
        <AddModal
          onClose={() => setAddContext(null)}
          onCreate={handleCreate}
          defaultZone={(() => {
            // Default the picker to the zone that the viewport is centered on.
            const cx = addContext.vp.x + addContext.vpPx.w / 2 / addContext.vp.zoom
            const cy = addContext.vp.y + addContext.vpPx.h / 2 / addContext.vp.zoom
            return zoneForPoint(cx, cy)
          })()}
        />
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
