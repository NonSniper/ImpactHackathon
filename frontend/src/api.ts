export type OrderInput = {
  package_id: string
  contact_name: string
  email: string
  phone: string
  delivery_address: string
  delivery_city: string
  delivery_postal_code: string
  delivery_date: string
  delivery_instructions: string
}

export type Order = { id: number; package_id: string }

const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export async function submitOrder(order: OrderInput): Promise<Order> {
  const response = await fetch(`${apiUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 503) throw new Error('Ordering is not open yet. Please check back soon.')
    if (response.status === 422) throw new Error('Please check your details and try again.')
    throw new Error('We could not submit your order. Please try again.')
  }
  return payload as Order
}
