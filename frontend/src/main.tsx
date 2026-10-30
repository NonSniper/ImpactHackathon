import { StrictMode, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { submitOrder, type OrderInput } from './api'
import './style.css'

const packages = [
  { id: 'family-classic', name: 'Family Favorites', description: 'A comforting, crowd-pleasing menu for three days.', tag: 'Classic' },
  { id: 'family-vegetarian', name: 'Plant Forward', description: 'A bright, satisfying vegetarian menu for three days.', tag: 'Vegetarian' },
]

const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
const minDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

function App() {
  const [packageId, setPackageId] = useState(packages[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState<number | null>(null)

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const input: OrderInput = {
      package_id: packageId,
      contact_name: String(form.get('contact_name') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      delivery_address: String(form.get('delivery_address') ?? ''),
      delivery_city: String(form.get('delivery_city') ?? ''),
      delivery_postal_code: String(form.get('delivery_postal_code') ?? ''),
      delivery_date: String(form.get('delivery_date') ?? ''),
      delivery_instructions: String(form.get('delivery_instructions') ?? ''),
    }
    setBusy(true)
    try {
      const order = await submitOrder(input)
      setOrderId(order.id)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not submit your order. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="app">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">F</span> Hearth & Harvest</a><span className="delivery-note">Good food, made easy</span></header>
    <main id="top">
      {orderId !== null ? <section className="confirmation" aria-live="polite"><span className="check" aria-hidden="true">✓</span><p className="eyebrow">Order received</p><h1>Thanks for ordering.</h1><p>Your order number is <strong>#{orderId}</strong>. We have your delivery details and will be in touch to confirm.</p><button className="button secondary" type="button" onClick={() => setOrderId(null)}>Place another order</button></section> : <>
        <section className="hero"><p className="eyebrow">A little more ease at dinner</p><h1>Three days of family meals, taken care of.</h1><p>Choose a meal package and tell us where to deliver. We’ll take it from there.</p><div className="hero-meta"><span>3 days</span><span>Family sized</span><span>Delivered to your door</span></div></section>
        <form className="order-form" onSubmit={placeOrder}>
          <section className="form-section" aria-labelledby="package-heading"><div className="section-title"><span className="step">01</span><div><h2 id="package-heading">Choose your package</h2><p>Each package includes three days of family meals.</p></div></div>
            <div className="packages">{packages.map(item => <label key={item.id} className={`package-card ${packageId === item.id ? 'selected' : ''}`}><input type="radio" name="package" value={item.id} checked={packageId === item.id} onChange={() => setPackageId(item.id)} /><span className="package-tag">{item.tag}</span><strong>{item.name}</strong><span>{item.description}</span><span className="radio-mark" aria-hidden="true" /></label>)}</div>
          </section>
          <section className="form-section" aria-labelledby="contact-heading"><div className="section-title"><span className="step">02</span><div><h2 id="contact-heading">Your contact details</h2><p>So we can reach you about your order.</p></div></div>
            <div className="field-grid"><label className="field full">Full name<input name="contact_name" autoComplete="name" required minLength={2} maxLength={120} /></label><label className="field">Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label className="field">Phone number<input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={30} /></label></div>
          </section>
          <section className="form-section" aria-labelledby="delivery-heading"><div className="section-title"><span className="step">03</span><div><h2 id="delivery-heading">Delivery details</h2><p>Choose a delivery date at least one day from today.</p></div></div>
            <div className="field-grid"><label className="field full">Street address<input name="delivery_address" autoComplete="street-address" required minLength={5} maxLength={300} /></label><label className="field">City or town<input name="delivery_city" autoComplete="address-level2" required minLength={2} maxLength={120} /></label><label className="field">Postal code<input name="delivery_postal_code" autoComplete="postal-code" required minLength={2} maxLength={20} /></label><label className="field">Preferred delivery date<input name="delivery_date" type="date" min={minDate} required /></label><label className="field full">Delivery instructions <span className="optional">Optional</span><textarea name="delivery_instructions" rows={3} maxLength={1000} placeholder="Gate code, where to leave the order, or other helpful details" /></label></div>
          </section>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="submit-row"><p>No payment is collected at this stage.</p><button className="button" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Request this package'} <span aria-hidden="true">→</span></button></div>
        </form>
      </>}
      <footer>Fresh meals. More time together.</footer>
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
