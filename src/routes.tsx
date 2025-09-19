import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
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
      { path: 'settings', element: <Settings /> }
    ]
  }
])

