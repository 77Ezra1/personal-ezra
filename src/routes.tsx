import { createBrowserRouter } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import Passwords from './pages/Passwords'
import Docs from './pages/Docs'
import Settings from './pages/Settings'
import App from './App'

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

