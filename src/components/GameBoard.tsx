import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, Copy, LogOut, Radio, RotateCcw } from 'lucide-react'
import { cardPower } from '../game'
import type { Card as CardType, GameAction, GameState, Player } from '../types'
import { Card } from './Card'
import { Rules } from './Rules'

interface GameBoardProps {
  game: GameState
  viewerId: string
  local: boolean
  connected: boolean
  error: string
  dispatch: (action: GameAction) => Promise<void> | void
  onLeave: () => void
}

function PlayerCards({
  player,
  game,
  faceUp,
  selected,
  canClick,
  onCard,
  title,
}: {
  player: Player
  game: GameState
  faceUp: (card: CardType) => boolean
  selected: string[]
  canClick: (card: CardType) => boolean
  onCard: (card: CardType) => void
  title?: string
}) {
  return (
    <section className="player-zone">
      <div className="player-label">
        <span><i className={game.players[game.currentPlayer]?.id === player.id && game.phase !== 'roundEnd' ? 'turn-light live' : 'turn-light'} /> {title ?? player.name}</span>
        <strong>{player.score}<small> pts</small></strong>
      </div>
      <div className="card-row">
        {player.cards.map((card) => (
          <Card key={card.id} card={card} faceUp={faceUp(card)} selected={selected.includes(card.id)} onClick={canClick(card) ? () => onCard(card) : undefined} />
        ))}
        {player.cards.length === 0 && <div className="empty-hand">No cards · 0</div>}
      </div>
    </section>
  )
}

export function GameBoard({ game, viewerId, local, connected, error, dispatch, onLeave }: GameBoardProps) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [setupPeek, setSetupPeek] = useState<Record<string, string[]>>({})
  const [temporaryReveal, setTemporaryReveal] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const closingReaction = useRef<string | null>(null)
  const reactionLocks = useRef(new Set<string>())
  const powerResolving = useRef(false)

  const current = game.players[game.currentPlayer]
  const localSetupPlayer = game.players.find((player) => !game.setupReady.includes(player.id))
  const actorId = local
    ? game.phase === 'setup' ? localSetupPlayer?.id ?? viewerId : current?.id ?? viewerId
    : viewerId
  const me = game.players.find((player) => player.id === actorId) ?? game.players[0]
  const opponent = game.players.find((player) => player.id !== me?.id) ?? game.players[1]
  const isMyTurn = current?.id === actorId
  const topDiscard = game.discard.at(-1)
  const reactionSeconds = game.reaction ? Math.max(0, (game.reaction.deadline - now) / 1000) : 0
  const reactionDeadline = game.reaction?.deadline
  const reactionNonce = game.reaction?.nonce
  const highlightedCards = game.phase === 'power' && game.power?.kind === 'swap'
    ? game.power.selected
    : selected

  useEffect(() => setSelected([]), [game.phase, game.drawn?.id, game.currentPlayer])

  useEffect(() => {
    if (game.phase !== 'reaction' || !reactionDeadline || !reactionNonce) return
    closingReaction.current = null
    const timer = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= reactionDeadline && closingReaction.current !== reactionNonce) {
        closingReaction.current = reactionNonce
        void dispatch({ type: 'closeReaction' })
      }
    }, 150)
    return () => window.clearInterval(timer)
  }, [game.phase, reactionDeadline, reactionNonce, dispatch])

  const allFaceUp = game.phase === 'roundEnd' || game.phase === 'gameOver'
  const setupIds = setupPeek[actorId] ?? []
  const selectedCards = useMemo(
    () => me?.cards.filter((card) => selected.includes(card.id)) ?? [],
    [me, selected],
  )

  function canClickCard(player: Player) {
    if (allFaceUp) return false
    if (game.phase === 'setup') return player.id === actorId && !game.setupReady.includes(actorId)
    if (game.phase === 'turn') return isMyTurn && player.id === actorId && Boolean(game.drawn)
    if (game.phase === 'reaction') {
      if (game.reaction?.passed.includes(player.id)) return false
      return local || player.id === viewerId
    }
    if (game.phase === 'power' && game.power?.actorId === actorId) {
      if (powerResolving.current) return false
      if (game.power.kind === 'peek') return player.id === actorId
      if (game.power.kind === 'spy') return player.id !== actorId
      return true
    }
    return false
  }

  function isFaceUp(card: CardType) {
    return allFaceUp || setupIds.includes(card.id) || temporaryReveal === card.id
  }

  function clickCard(player: Player, card: CardType) {
    if (game.phase === 'setup') {
      const previous = setupPeek[actorId] ?? []
      const next = previous.includes(card.id) ? previous.filter((id) => id !== card.id) : previous.length < 2 ? [...previous, card.id] : previous
      setSetupPeek({ ...setupPeek, [actorId]: next })
      return
    }
    if (game.phase === 'turn') {
      setSelected((previous) => previous.includes(card.id) ? previous.filter((id) => id !== card.id) : [...previous, card.id])
      return
    }
    if (game.phase === 'reaction' && game.reaction) {
      const lock = `${game.reaction.nonce}:${player.id}`
      if (reactionLocks.current.has(lock)) return
      reactionLocks.current.add(lock)
      void Promise.resolve(dispatch({ type: 'matchReaction', playerId: player.id, cardId: card.id, nonce: game.reaction.nonce }))
        .finally(() => reactionLocks.current.delete(lock))
      return
    }
    if (game.phase === 'power' && game.power) {
      if (game.power.kind === 'swap') {
        void dispatch({ type: 'powerCard', playerId: actorId, cardId: card.id })
      } else {
        if (powerResolving.current) return
        powerResolving.current = true
        setTemporaryReveal(card.id)
        window.setTimeout(() => {
          setTemporaryReveal(null)
          void Promise.resolve(dispatch({ type: 'powerCard', playerId: actorId, cardId: card.id }))
            .finally(() => { powerResolving.current = false })
        }, 1400)
      }
    }
  }

  async function copyRoom() {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${game.code}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  if (game.phase === 'waiting') {
    return (
      <main className="waiting-screen">
        <div className="brand-lockup"><span className="brand-dot" /> CABO</div>
        <section className="waiting-card">
          <div className="waiting-pulse"><Radio /></div>
          <p className="eyebrow">Private table ready</p>
          <h1>Waiting for player two.</h1>
          <p>Send this code to your opponent. The round starts the moment they join.</p>
          <button className="room-code" onClick={copyRoom}>{game.code.split('').map((letter, index) => <b key={index}>{letter}</b>)} <span>{copied ? <Check /> : <Copy />}</span></button>
          <button className="text-button" onClick={onLeave}>Cancel room</button>
        </section>
      </main>
    )
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup"><span className="brand-dot" /> CABO</div>
        <div className="round-label"><span>ROUND</span> {game.round}</div>
        <div className="header-actions">
          {!local && <button className="connection-pill" onClick={copyRoom}><i className={connected ? 'online' : ''} /> {game.code} {copied ? <Check size={14} /> : <Copy size={14} />}</button>}
          <button className="icon-button" onClick={() => setRulesOpen(true)} aria-label="Rules"><BookOpen /></button>
          <button className="icon-button" onClick={onLeave} aria-label="Leave game"><LogOut /></button>
        </div>
      </header>

      <div className="table">
        {opponent && (
          <PlayerCards player={opponent} game={game} faceUp={isFaceUp} selected={highlightedCards} canClick={() => canClickCard(opponent)} onCard={(card) => clickCard(opponent, card)} />
        )}

        <section className="table-center">
          <div className="pile-wrap">
            <span>DRAW <small>{game.deck.length}</small></span>
            <Card compact disabled />
            {game.phase === 'turn' && isMyTurn && !game.drawn && <button className="pile-hitbox" onClick={() => void dispatch({ type: 'drawDeck', playerId: actorId })} aria-label="Draw from deck" />}
          </div>
          <div className="turn-status">
            {game.caboCaller && <b className="cabo-alert">CABO · FINAL TURN</b>}
            <p>{statusText(game, actorId, local)}</p>
            {game.phase !== 'reaction' && <small className="last-move">{game.log[0]}</small>}
            {game.phase === 'reaction' && <div className="reaction-meter"><i style={{ width: `${(reactionSeconds / 4.2) * 100}%` }} /><span>{reactionSeconds.toFixed(1)}s</span></div>}
          </div>
          <div className="pile-wrap discard-wrap">
            <span>DISCARD</span>
            {topDiscard ? <Card card={topDiscard} faceUp compact /> : <div className="empty-pile" />}
            {game.phase === 'turn' && isMyTurn && !game.drawn && topDiscard && <button className="pile-hitbox" onClick={() => void dispatch({ type: 'takeDiscard', playerId: actorId })} aria-label="Take discard" />}
          </div>
        </section>

        {me && (
          <PlayerCards player={me} game={game} faceUp={isFaceUp} selected={highlightedCards} canClick={() => canClickCard(me)} onCard={(card) => clickCard(me, card)} title={local ? me.name : `${me.name} · YOU`} />
        )}
      </div>

      <footer className="action-dock">
        {game.phase === 'setup' && me && (
          <div className="setup-action"><span>Secretly peek at <b>any two</b> of your cards.</span><button className="primary-button small" disabled={setupIds.length !== 2} onClick={() => { setTemporaryReveal(null); void dispatch({ type: 'setupReady', playerId: actorId }) }}>Remember them <Check size={17} /></button></div>
        )}
        {game.phase === 'turn' && isMyTurn && !game.drawn && (
          <div className="turn-actions"><span>Draw a card, take the discard, or</span><button className="cabo-button" onClick={() => void dispatch({ type: 'callCabo', playerId: actorId })}>CALL CABO</button></div>
        )}
        {game.phase === 'turn' && isMyTurn && game.drawn && (
          <div className="drawn-action">
            <div className="drawn-card"><Card card={game.drawn} faceUp compact /><span>You drew <b>{game.drawn.value}</b>{cardPower(game.drawn.value) && game.drawnFrom === 'deck' ? ` · ${cardPower(game.drawn.value)}` : ''}</span></div>
            <div className="action-buttons">
              <button disabled={selected.length === 0} onClick={() => void dispatch({ type: 'exchange', playerId: actorId, cardIds: selected })}>Exchange{selected.length > 1 ? ` ${selected.length}` : ''}</button>
              {game.drawnFrom === 'deck' && cardPower(game.drawn.value) && <button onClick={() => void dispatch({ type: 'usePower', playerId: actorId })}>Use {cardPower(game.drawn.value)}</button>}
              {game.drawnFrom === 'deck' && <button className="quiet-button" onClick={() => void dispatch({ type: 'discardDrawn', playerId: actorId })}>Just discard</button>}
            </div>
            {selectedCards.length > 1 && <small className="set-warning">Set attempt: all selected cards must match.</small>}
          </div>
        )}
        {game.phase === 'reaction' && (
          <div className="reaction-action"><b>Quick match!</b><span>Tap a face-down card you believe is {topDiscard?.value}.</span>{!local && !game.reaction?.passed.includes(viewerId) && <button onClick={() => void dispatch({ type: 'passReaction', playerId: viewerId })}>No match</button>}</div>
        )}
        {game.phase === 'power' && game.power && (
          <div className="power-action"><b>{game.power.kind.toUpperCase()}</b><span>{game.power.kind === 'peek' ? 'Choose one of your cards.' : game.power.kind === 'spy' ? "Choose one opponent card." : game.power.selected.length ? 'Choose the second card.' : 'Choose any two cards to swap.'}</span></div>
        )}
        {!['setup', 'turn', 'reaction', 'power'].includes(game.phase) && <span>Round complete.</span>}
      </footer>

      {(game.phase === 'roundEnd' || game.phase === 'gameOver') && <RoundOverlay game={game} actorId={actorId} dispatch={dispatch} onLeave={onLeave} />}
      {rulesOpen && <Rules onClose={() => setRulesOpen(false)} />}
      {error && <div className="toast" role="alert">{error}</div>}
    </main>
  )
}

function statusText(game: GameState, actorId: string, local: boolean) {
  const current = game.players[game.currentPlayer]
  if (game.phase === 'setup') return local ? `${game.players.find((p) => !game.setupReady.includes(p.id))?.name}, learn your cards` : game.setupReady.includes(actorId) ? 'Waiting for your opponent' : 'Learn your opening cards'
  if (game.phase === 'reaction') return game.reaction?.message ?? 'Match the discard'
  if (game.phase === 'power') return `${game.players.find((p) => p.id === game.power?.actorId)?.name} is using ${game.power?.kind}`
  if (game.phase === 'turn') return current?.id === actorId ? 'Your move' : `${current?.name} is thinking…`
  return 'Cards revealed'
}

function RoundOverlay({ game, actorId, dispatch, onLeave }: { game: GameState; actorId: string; dispatch: (action: GameAction) => Promise<void> | void; onLeave: () => void }) {
  const winner = [...game.players].sort((a, b) => a.score - b.score)[0]
  return (
    <div className="modal-backdrop result-backdrop">
      <article className="result-modal">
        <p className="eyebrow">{game.phase === 'gameOver' ? 'Game complete' : `Round ${game.round} complete`}</p>
        <h2>{game.result?.kamikaze ? 'Kamikaze!' : game.result?.caboSucceeded === true ? 'Perfect call.' : game.result?.caboSucceeded === false ? 'Cabo caught.' : 'Cards down.'}</h2>
        <div className="score-table">
          {game.players.map((player) => <div key={player.id}><span>{player.name}<small>card total {game.result?.totals[player.id]}</small></span><b>{(game.result?.changes[player.id] ?? 0) > 0 ? '+' : ''}{game.result?.changes[player.id]}</b><strong>{player.score} pts</strong></div>)}
        </div>
        {game.phase === 'gameOver' ? <><p className="winner-line">{winner.name} wins with {winner.score} points.</p><button className="primary-button" onClick={onLeave}>Back to home</button></> : <button className="primary-button" onClick={() => void dispatch({ type: 'nextRound', playerId: actorId })}>Next round <RotateCcw size={17} /></button>}
      </article>
    </div>
  )
}
