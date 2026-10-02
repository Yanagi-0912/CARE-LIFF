import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { bootstrapLiff } from './liffBootstrap'
import { isPublicRoute } from './utils/publicRoutes'

const bootstrap = isPublicRoute(window.location.pathname)
  ? Promise.resolve()
  : bootstrapLiff()

void bootstrap.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
