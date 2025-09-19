import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './routes'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find the root element')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <React.Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-slate-200">
          Loading&hellip;
        </div>
      }
    >
      <RouterProvider router={router} />
    </React.Suspense>
  </React.StrictMode>,
)
