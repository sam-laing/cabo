import { useEffect, useState } from 'react'
import { ArrowRight, Copy, Globe2, Sparkles, Users } from 'lucide-react'
import { onlineAvailable } from '../online'

interface LandingProps {
  initialCode: string
  busy: boolean
  error: string
  onLocal: (first: string, second: string) => void
  onCreate: (name: string) => void
  onJoin: (name: string, code: string) => void
}

export function Landing({ initialCode, busy, error, onLocal, onCreate, onJoin }: LandingProps) {
  const [mode, setMode] = useState<'online' | 'local'>(onlineAvailable ? 'online' : 'local')
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode)
  const [secondName, setSecondName] = useState('')

  useEffect(() => {
    if (initialCode) setMode('online')
  }, [initialCode])

  return (
    <main className="landing-shell">
      <section className="hero">
        <div className="brand-lockup"><span className="brand-dot" /> CABO</div>
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={14} /> Memory. Nerve. One last turn.</p>
          <h1>Read the table.<br /><em>Keep it low.</em></h1>
          <p className="hero-sub">A crisp two-player card game for quiet bluffs, risky swaps, and the perfect Cabo call.</p>
        </div>
        <div className="mini-cards" aria-hidden="true">
          <div className="mini-card mc-one"><small>PEEK</small><strong>7</strong></div>
          <div className="mini-card mc-two"><small>SWAP</small><strong>12</strong></div>
          <div className="mini-card back"><b>C</b></div>
        </div>
        <p className="hero-foot">2 players <span /> 10–20 min <span /> private rooms</p>
      </section>

      <section className="start-panel">
        <div className="panel-heading">
          <p className="eyebrow">Your table</p>
          <h2>Let’s play.</h2>
        </div>
        <div className="mode-tabs">
          <button className={mode === 'online' ? 'active' : ''} onClick={() => setMode('online')} disabled={!onlineAvailable}><Globe2 size={17} /> Online</button>
          <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}><Users size={17} /> Same device</button>
        </div>

        {mode === 'online' ? (
          <form onSubmit={(event) => { event.preventDefault(); if (code) onJoin(name, code); else onCreate(name) }}>
            <label>Your name<input autoFocus maxLength={18} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anna" required /></label>
            <label>Room code <span className="optional">leave empty to create</span>
              <div className="input-icon"><Copy size={16} /><input maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="SIX LETTERS" /></div>
            </label>
            <button className="primary-button" disabled={busy}>{busy ? 'Opening table…' : code ? 'Join room' : 'Create private room'} <ArrowRight size={18} /></button>
          </form>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); onLocal(name, secondName) }}>
            <label>Player one<input autoFocus maxLength={18} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anna" required /></label>
            <label>Player two<input maxLength={18} value={secondName} onChange={(e) => setSecondName(e.target.value)} placeholder="e.g. Mia" required /></label>
            <button className="primary-button">Play on this device <ArrowRight size={18} /></button>
          </form>
        )}
        {!onlineAvailable && <p className="config-note">Online rooms unlock after adding the two Supabase environment variables.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="privacy-note">No account. No tracking. Just share the room code.</p>
      </section>
    </main>
  )
}
