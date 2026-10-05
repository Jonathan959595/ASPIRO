export type DemoUser = { name: string; email: string }

const storageKey = 'aspiro-demo-user'

export function readDemoUser(): DemoUser | null {
  try {
    const value = window.localStorage.getItem(storageKey)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<DemoUser>
    if (typeof parsed.name !== 'string' || typeof parsed.email !== 'string') return null
    return { name: parsed.name, email: parsed.email }
  } catch (error) {
    console.warn('Could not restore the local demo session.', error)
    return null
  }
}

export function startDemoSession(user: DemoUser): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(user))
  } catch (error) {
    console.error('Could not save the local demo session.', error)
    throw new Error('This browser could not save the demo session. Check local storage settings and retry.')
  }
}

export function endDemoSession(): void {
  try {
    window.localStorage.removeItem(storageKey)
  } catch (error) {
    console.error('Could not clear the local demo session.', error)
    throw new Error('Could not clear this browser’s demo session.')
  }
}
