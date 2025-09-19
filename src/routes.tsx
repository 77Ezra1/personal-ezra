import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import Passwords from './pages/Passwords'
import Docs from './pages/Docs'
import Settings from './pages/Settings'
import Notes from './pages/Notes'
import App from './App'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sites = lazy(() => import('./pages/Sites'))
const Passwords = lazy(() => import('./pages/Passwords'))
const Docs = lazy(() => import('./pages/Docs'))
const Settings = lazy(() => import('./pages/Settings'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'sites', element: <Sites /> },
      { path: 'passwords', element: <Passwords /> },
      { path: 'docs', element: <Docs /> },
      { path: 'notes', element: <Notes /> },
      { path: 'settings', element: <Settings /> }
    ]
  }
])

