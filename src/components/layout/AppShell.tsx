import type { ReactNode } from 'react'
import type { AriaContext, AriaEvent } from '../aria/AriaCompanion'
import { AriaCompanion } from '../aria/AriaCompanion'
import type { DemoUser } from '../../services/demoAuth'
import { routePaths, type AppPage } from '../../routes/routes'

const mainLinks: Array<{ page: AppPage; label: string }> = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'lab', label: 'Quantum Lab' },
  { page: 'experiments', label: 'Experiments' },
  { page: 'challenges', label: 'Challenges' },
  { page: 'projects', label: 'Projects' },
  { page: 'profile', label: 'Profile' },
]

export function AppShell({
  page,
  user,
  onNavigate,
  onSignOut,
  ariaContext,
  ariaEvent,
  ariaInsight,
  children,
}: {
  page: AppPage
  user: DemoUser | null
  onNavigate: (page: AppPage) => void
  onSignOut: () => void
  ariaContext: AriaContext
  ariaEvent: AriaEvent | null
  ariaInsight: string
  children: ReactNode
}) {
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); onNavigate('home') }}>ASPIRO<span>◈</span></a>
      <nav className="app-nav" aria-label="Main navigation">
        <a className={page === 'home' ? 'current' : ''} href="/" onClick={event => { event.preventDefault(); onNavigate('home') }}>Home</a>
        {user ? mainLinks.map(link => <a key={link.page} className={page === link.page ? 'current' : ''} href={routePaths[link.page]} onClick={event => { event.preventDefault(); onNavigate(link.page) }}>{link.label}</a>) : null}
      </nav>
      <div className="header-account">
        {user
          ? <><span className="header-user">{user.name}</span><button className="header-auth" onClick={onSignOut}>SIGN OUT</button></>
          : <><button className="header-auth" onClick={() => onNavigate('signin')}>SIGN IN</button><button className="header-register" onClick={() => onNavigate('register')}>REGISTER</button></>}
      </div>
    </header>
    {children}
    <footer className="site-footer">
      <div className="footer-brand"><b>ASPIRO</b><span>Adaptive AI-Driven Quantum Experimentation &amp; Learning Environment</span></div>
      <nav className="footer-links" aria-label="Footer navigation">
        {([
          ['home', 'Home'], ['lab', 'Quantum Lab'], ['experiments', 'Experiments'],
          ['challenges', 'Challenges'], ['projects', 'Projects'], ['profile', 'Profile'],
        ] as Array<[AppPage, string]>).map(([target, label]) =>
          <a key={target} href={routePaths[target]} onClick={event => { event.preventDefault(); onNavigate(target) }}>{label}</a>)}
      </nav>
      <span className="footer-tagline">An interactive environment for learning, experimenting with, and understanding quantum computing.</span>
    </footer>
    <AriaCompanion context={ariaContext} event={ariaEvent} insight={ariaInsight} />
  </div>
}
