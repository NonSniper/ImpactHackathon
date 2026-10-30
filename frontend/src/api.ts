export type Task = { id: number; title: string; completed: boolean }

const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  listTasks: () => request<Task[]>('/tasks'),
  createTask: (title: string) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title }) }),
  updateTask: (task: Task) => request<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !task.completed }) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
}
