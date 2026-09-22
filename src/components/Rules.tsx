import { X } from 'lucide-react'

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <article className="rules-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button close" onClick={onClose} aria-label="Close rules"><X /></button>
        <p className="eyebrow">Quick rules</p>
        <h2>Lowest hand wins.</h2>
        <div className="rules-grid">
          <section><b>On your turn</b><p>Draw blind, take the discard, or call Cabo. Exchange the card, discard it, or use a power drawn from the deck.</p></section>
          <section><b>7–8 · Peek</b><p>Look at one of your own cards.</p></section>
          <section><b>9–10 · Spy</b><p>Look at one opponent card.</p></section>
          <section><b>11–12 · Swap</b><p>Swap any two table cards without looking.</p></section>
          <section><b>Match</b><p>During the reaction timer, tap a face-down card you think matches the discard. Miss and you take a penalty.</p></section>
          <section><b>Cabo</b><p>Your opponent gets one final turn. Lowest total scores 0; a wrong caller adds 5.</p></section>
        </div>
        <p className="rules-fine">Exact 100 resets to 50 once. Calling Cabo with two 12s and two 13s triggers Kamikaze: −50 for you, +50 for your opponent.</p>
      </article>
    </div>
  )
}
