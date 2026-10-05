import { useCallback, useEffect, useState } from 'react'
import { resolvePage, routePaths, type AppPage } from '../routes/routes'

export function useAppRouter() {
  const [page, setPage] = useState<AppPage>(() => resolvePage(window.location.pathname))

  useEffect(() => {
    const syncPage = () => setPage(resolvePage(window.location.pathname))
    window.addEventListener('popstate', syncPage)
    return () => window.removeEventListener('popstate', syncPage)
  }, [])

  const navigate = useCallback((nextPage: AppPage, replace = false) => {
    const path = routePaths[nextPage]
    if (window.location.pathname !== path) {
      if (replace) window.history.replaceState({}, '', path)
      else window.history.pushState({}, '', path)
    }
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  return { page, navigate }
}
