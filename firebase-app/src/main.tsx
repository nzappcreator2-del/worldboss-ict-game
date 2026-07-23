import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import AppLoadingGate from './AppLoadingGate'
import { installClientErrorReporting } from './services/errorReporting'
import { installGameAudioRouting } from './services/gameAudio'
import { installGlobalUiSoundDelegate } from './services/uiSfx'
import { startAssetWarmup } from './services/assetWarmup'
import './index.css'

installClientErrorReporting()
installGameAudioRouting()
installGlobalUiSoundDelegate()
// Offline-first cache: no-op in dev, auto-updates itself on new deploys.
registerSW({ immediate: true })
startAssetWarmup()
const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(<AppLoadingGate />)
