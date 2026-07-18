import { createRoot } from 'react-dom/client'
import AppLoadingGate from './AppLoadingGate'
import { installClientErrorReporting } from './services/errorReporting'
import './index.css'

installClientErrorReporting()
const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(<AppLoadingGate />)
