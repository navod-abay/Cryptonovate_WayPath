import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LoaderApp from './LoaderApp'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoaderApp />
  </React.StrictMode>,
)
