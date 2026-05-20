import { createClient } from '@supabase/supabase-js'

// To enable cloud sync, fill these in. Until then the app uses local storage only.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

const LS_KEY = 'stone:tasks:v1'

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveLocal(tasks) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(tasks)) } catch {}
}

export const store = {
  async list() {
    if (supabase) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) { console.warn('supabase list failed, falling back to local', error); return loadLocal() }
      return data || []
    }
    return loadLocal()
  },

  async create(task) {
    const row = {
      id: task.id || crypto.randomUUID(),
      title: task.title,
      x: task.x ?? 24,
      y: task.y ?? 24,
      scheduled_hour: task.scheduled_hour ?? null,
      created_at: new Date().toISOString()
    }
    if (supabase) {
      const { data, error } = await supabase.from('tasks').insert(row).select().single()
      if (error) console.warn('supabase insert failed', error)
      return data || row
    }
    const all = loadLocal()
    all.unshift(row)
    saveLocal(all)
    return row
  },

  async update(id, patch) {
    if (supabase) {
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
      if (error) console.warn('supabase update failed', error)
      return data
    }
    const all = loadLocal()
    const i = all.findIndex(t => t.id === id)
    if (i >= 0) { all[i] = { ...all[i], ...patch }; saveLocal(all) }
    return all[i]
  },

  async remove(id) {
    if (supabase) {
      await supabase.from('tasks').delete().eq('id', id)
      return
    }
    const all = loadLocal().filter(t => t.id !== id)
    saveLocal(all)
  }
}
