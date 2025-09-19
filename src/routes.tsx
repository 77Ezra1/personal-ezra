import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import App from './App'

const Dashboard = lazy(() => import('./routes/Dashboard'))
const Login = lazy(() => import('./routes/Login'))
const Register = lazy(() => import('./routes/Register'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
    ],
  },
])
