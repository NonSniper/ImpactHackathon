import { StrictMode, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { api, type Task } from './api'
import './style.css'

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadTasks() {
    setLoading(true)
    setError('')
    try { setTasks(await api.listTasks()) }
    catch { setError('Could not load tasks. Check that the API is running, then try again.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void loadTasks() }, [])

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      const task = await api.createTask(trimmed)
      setTasks(current => [task, ...current])
      setTitle('')
    } catch { setError('Could not add the task. Please try again.') }
    finally { setBusy(false) }
  }

  async function toggleTask(task: Task) {
    setBusy(true)
    setError('')
    try {
      const updated = await api.updateTask(task)
      setTasks(current => current.map(item => item.id === updated.id ? updated : item))
    } catch { setError('Could not update the task. Please try again.') }
    finally { setBusy(false) }
  }

  async function deleteTask(id: number) {
    setBusy(true)
    setError('')
    try {
      await api.deleteTask(id)
      setTasks(current => current.filter(task => task.id !== id))
    } catch { setError('Could not delete the task. Please try again.') }
    finally { setBusy(false) }
  }

  const remaining = tasks.filter(task => !task.completed).length
  return (
    <div className="app">
      <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">S</span> Starter project</div><a href={`${(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')}/docs`} target="_blank" rel="noreferrer" className="docs-link">API docs <span aria-hidden="true">↗</span></a></header>
      <main>
        <div className="intro"><div><h1>A little space to start.</h1><p>A working example for your next idea. Add a task to see your app and database in action.</p></div><span className="stack">React <span>·</span> FastAPI <span>·</span> SQL</span></div>
        <section className="task-panel" aria-labelledby="task-heading">
          <div className="panel-heading"><div><h2 id="task-heading">Your tasks</h2><p>{loading ? 'Loading your list…' : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}</p></div><span className="count">{tasks.length}</span></div>
          <form onSubmit={addTask} className="task-form"><label className="sr-only" htmlFor="new-task">New task</label><input id="new-task" value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" maxLength={200} disabled={busy || loading} /><button type="submit" disabled={busy || loading || !title.trim()}>Add task <span aria-hidden="true">+</span></button></form>
          {error && <div className="error" role="alert">{error} <button type="button" onClick={() => void loadTasks()}>Reload list</button></div>}
          {!loading && tasks.length === 0 && !error ? <div className="empty"><div className="empty-icon" aria-hidden="true">✓</div><h3>A clear starting point</h3><p>Your list is empty. Add a task above to get going.</p></div> : <ul className="task-list">{tasks.map(task => <li key={task.id}><label className={task.completed ? 'task completed' : 'task'}><input type="checkbox" checked={task.completed} disabled={busy} onChange={() => void toggleTask(task)} /><span>{task.title}</span></label><button className="delete" type="button" onClick={() => void deleteTask(task.id)} disabled={busy} aria-label={`Delete ${task.title}`}>Delete</button></li>)}</ul>}
        </section>
        <p className="footnote">Made to be built upon <span>—</span> your next step starts here.</p>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
