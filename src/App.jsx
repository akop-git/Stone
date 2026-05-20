import { useEffect, useState, useRef } from 'react'
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import { store } from './lib/store.js'

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6) // 6am - 9pm

function fmtDate() {
  const d = new Date()
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}${ampm}`
}

// ---------- CANVAS PAGE ----------

function CanvasStone({ task, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { source: 'canvas' }
  })

  const style = {
    left: task.x,
    top: task.y,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-stone ${isDragging ? 'dragging' : ''} ${task.scheduled_hour != null ? 'scheduled' : ''}`}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onOpen(task)}
    >
      <div className="title">{task.title}</div>
      <div className="meta">
        {task.scheduled_hour != null ? `Scheduled · ${fmtHour(task.scheduled_hour)}` : 'Unscheduled'}
      </div>
    </div>
  )
}

function CanvasPage({ tasks, setTasks, onAdd }) {
  const canvasRef = useRef(null)

  const handleDragEnd = async (event) => {
    const { active, delta } = event
    const task = tasks.find(t => t.id === active.id)
    if (!task) return
    const bounds = canvasRef.current?.getBoundingClientRect()
    const maxX = (bounds?.width ?? 360) - 160
    const maxY = (bounds?.height ?? 600) - 80
    const newX = Math.max(8, Math.min(maxX, (task.x || 24) + delta.x))
    const newY = Math.max(8, Math.min(maxY, (task.y || 24) + delta.y))
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, x: newX, y: newY } : t))
    await store.update(task.id, { x: newX, y: newY })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  return (
    <div className="page">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="canvas" ref={canvasRef}>
          {tasks.length === 0 && (
            <div className="empty">
              <h3>nothing yet.</h3>
              <p>tap + to drop your first stone.</p>
            </div>
          )}
          {tasks.map(task => (
            <CanvasStone key={task.id} task={task} onOpen={() => {}} />
          ))}
        </div>
      </DndContext>
      <button className="fab" onClick={onAdd} aria-label="Add task">+</button>
    </div>
  )
}

// ---------- CALENDAR PAGE ----------

function TimeSlot({ hour, tasks }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${hour}`, data: { hour } })
  return (
    <div ref={setNodeRef} className={`cal-row ${isOver ? 'over' : ''}`}>
      <div className="cal-time">{fmtHour(hour)}</div>
      <div className="cal-slot">
        {tasks.map(t => <CalendarTask key={t.id} task={t} />)}
      </div>
    </div>
  )
}

function CalendarTask({ task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { source: 'calendar' }
  })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1
  }
  return (
    <div ref={setNodeRef} style={style} className="cal-task" {...listeners} {...attributes}>
      {task.title}
    </div>
  )
}

function TrayTask({ task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { source: 'tray' }
  })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1
  }
  return (
    <div ref={setNodeRef} style={style} className="tray-task" {...listeners} {...attributes}>
      {task.title}
    </div>
  )
}

function UnscheduledTray({ setNodeRef, isOver, tasks }) {
  return (
    <div ref={setNodeRef} className="tray" style={isOver ? { background: 'rgba(138,58,44,0.06)' } : undefined}>
      <div className="tray-label">Unscheduled</div>
      {tasks.length === 0 && <div className="tray-label" style={{ color: 'var(--ink-faint)' }}>drag here to unschedule</div>}
      {tasks.map(t => <TrayTask key={t.id} task={t} />)}
    </div>
  )
}

function CalendarPage({ tasks, setTasks }) {
  const { setNodeRef: trayRef, isOver: trayOver } = useDroppable({ id: 'tray' })

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return
    const taskId = active.id
    let patch = null
    if (over.id === 'tray') {
      patch = { scheduled_hour: null }
    } else if (typeof over.id === 'string' && over.id.startsWith('slot-')) {
      const hour = Number(over.id.slice(5))
      patch = { scheduled_hour: hour }
    }
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
            <TimeSlot key={hour} hour={hour} tasks={items} />
          ))}
        </div>
        <UnscheduledTray setNodeRef={trayRef} isOver={trayOver} tasks={unscheduled} />
      </div>
    </DndContext>
  )
}

// ---------- ADD TASK MODAL ----------

function AddModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate(trimmed)
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
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>cancel</button>
          <button className="btn btn-primary" onClick={submit}>add</button>
        </div>
      </div>
    </div>
  )
}

// ---------- APP ----------

export default function App() {
  const [tasks, setTasks] = useState([])
  const [tab, setTab] = useState('canvas')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    store.list().then(setTasks)
  }, [])

  const handleCreate = async (title) => {
    // place new stones in a slightly randomized spot so they don't pile up
    const x = 24 + Math.floor(Math.random() * 120)
    const y = 24 + Math.floor(Math.random() * 200)
    const created = await store.create({ title, x, y })
    setTasks(prev => [created, ...prev])
    setAddOpen(false)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">stone.</div>
        <div className="date">{fmtDate()}</div>
      </header>

      {tab === 'canvas'
        ? <CanvasPage tasks={tasks} setTasks={setTasks} onAdd={() => setAddOpen(true)} />
        : <CalendarPage tasks={tasks} setTasks={setTasks} />}

      <nav className="tabs">
        <button className={`tab ${tab === 'canvas' ? 'active' : ''}`} onClick={() => setTab('canvas')}>Canvas</button>
        <button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
      </nav>

      {addOpen && <AddModal onClose={() => setAddOpen(false)} onCreate={handleCreate} />}
    </div>
  )
}
