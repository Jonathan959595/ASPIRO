export const routePaths = {
  home: '/',
  signin: '/signin',
  register: '/register',
  dashboard: '/dashboard',
  lab: '/lab',
  experiments: '/experiments',
  challenges: '/challenges',
  projects: '/projects',
  application: '/application',
  profile: '/profile',
} as const

export type AppPage = keyof typeof routePaths

const pageForPath = new Map<string, AppPage>(
  Object.entries(routePaths).map(([page, path]) => [path, page as AppPage]),
)

export function resolvePage(pathname: string): AppPage {
  return pageForPath.get(pathname.replace(/\/+$/, '') || '/') ?? 'home'
}
