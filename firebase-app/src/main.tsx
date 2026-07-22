import { createRoot } from 'react-dom/client'
import AppLoadingGate from './AppLoadingGate'
import { installClientErrorReporting } from './services/errorReporting'
import { installGameAudioRouting } from './services/gameAudio'
import './index.css'

installClientErrorReporting()
installGameAudioRouting()
const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(<AppLoadingGate />)
