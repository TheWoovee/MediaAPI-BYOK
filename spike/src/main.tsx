import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
function App() {
  const [me, setMe] = useState<string>('loading')
  useEffect(() => { fetch('/studio/api/me').then(r => r.json()).then(j => setMe(JSON.stringify(j))).catch(e => setMe(String(e))) }, [])
  return <main><h1>Studio spike</h1><p>path: {location.pathname}</p><p>/studio/api/me → {me}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)
