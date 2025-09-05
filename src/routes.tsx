import { createBrowserRouter } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import Vault from './pages/Vault'
import Docs from './pages/Docs'
import Settings from './pages/Settings'
import Chat from './pages/Chat'
import App from './App'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'sites', element: <Sites /> },
      { path: 'vault', element: <Vault /> },
      { path: 'docs', element: <Docs /> },
      { path: 'chat', element: <Chat /> },
      { path: 'settings', element: <Settings /> }
    ]
  }
])
