import type { Card as CardType } from '../types'

interface CardProps {
  card?: CardType
  faceUp?: boolean
  selected?: boolean
  disabled?: boolean
  compact?: boolean
  label?: string
  onClick?: () => void
}

const suitMark = { moon: '●', sun: '✦', wave: '≈', leaf: '◆' }

export function Card({ card, faceUp = false, selected = false, disabled = false, compact = false, label, onClick }: CardProps) {
  const power = card && (card.value === 7 || card.value === 8 ? 'PEEK' : card.value === 9 || card.value === 10 ? 'SPY' : card.value === 11 || card.value === 12 ? 'SWAP' : '')
  return (
    <button
      className={`card ${faceUp ? 'face-up' : 'face-down'} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={label ?? (faceUp && card ? `Card ${card.value}` : 'Face-down card')}
    >
      {faceUp && card ? (
        <>
          <span className="card-corner">{card.value}</span>
          <span className={`card-suit ${card.suit}`}>{suitMark[card.suit]}</span>
          {power && <span className="card-power">{power}</span>}
          <span className="card-corner bottom">{card.value}</span>
        </>
      ) : (
        <span className="card-back-mark">C</span>
      )}
    </button>
  )
}
