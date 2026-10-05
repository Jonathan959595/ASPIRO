import { useState, type FormEvent } from 'react'
import type { DemoUser } from '../services/demoAuth'

export function AuthPage({
  mode,
  onComplete,
  onSwitchMode,
}: {
  mode: 'signin' | 'register'
  onComplete: (user: DemoUser) => void
  onSwitchMode: (mode: 'signin' | 'register') => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const isRegister = mode === 'register'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail.includes('@')) {
      setError('Enter a valid email address for your local demo profile.')
      return
    }
    const displayName = (isRegister ? name.trim() : normalizedEmail.split('@')[0]) || 'Quantum Explorer'
    try {
      onComplete({ name: displayName, email: normalizedEmail })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a local demo session.')
    }
  }

  return <main className="auth-page">
    <section className="auth-card panel">
      <span className="eyebrow">ASPIRO · LOCAL DEMO ACCESS</span>
      <h1>{isRegister ? 'Create a learner profile' : 'Welcome back'}</h1>
      <p>{isRegister ? 'Set up a lightweight profile to save experiment progress in this browser.' : 'Re-enter a local demo profile. No account or password check is performed.'}</p>
      <form onSubmit={submit} className="auth-form">
        {isRegister && <label>Display name<input value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" placeholder="Quantum Explorer" maxLength={50} /></label>}
        <label>Email for this demo profile<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit">CONTINUE TO ASPIRO →</button>
      </form>
      <p className="auth-disclaimer">Prototype-only profile: no password is requested, verified, or saved. This is not production authentication. Your profile is stored only in this browser.</p>
      <div className="auth-switch">{isRegister ? 'Already have a local profile?' : 'New to ASPIRO?'} <button type="button" className="auth-link" onClick={() => onSwitchMode(isRegister ? 'signin' : 'register')}>{isRegister ? 'Sign in' : 'Create profile'}</button></div>
    </section>
  </main>
}
