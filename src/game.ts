import type { Card, GameAction, GameState, Player, ResumeAction, Suit } from './types'

const REACTION_MS = 4200
const suits: Suit[] = ['moon', 'sun', 'wave', 'leaf']

const uid = () => crypto.randomUUID()

export function makeDeck(): Card[] {
  return suits.flatMap((suit) =>
    Array.from({ length: 14 }, (_, value) => ({ id: uid(), value, suit })),
  )
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function createGame(code: string, host: Pick<Player, 'id' | 'name'>): GameState {
  return {
    code,
    phase: 'waiting',
    round: 0,
    players: [{ ...host, cards: [], score: 0, exactResetUsed: false }],
    deck: [],
    discard: [],
    currentPlayer: 0,
    startingPlayer: 0,
    setupReady: [],
    drawn: null,
    drawnFrom: null,
    caboCaller: null,
    finalTurnsRemaining: null,
    reaction: null,
    power: null,
    result: null,
    log: [`${host.name} opened the table.`],
  }
}

function addLog(state: GameState, message: string): GameState {
  return { ...state, log: [message, ...state.log].slice(0, 16) }
}

function startRound(state: GameState): GameState {
  const deck = shuffle(makeDeck())
  const players = state.players.map((player) => ({ ...player, cards: deck.splice(0, 4) }))
  const discard = [deck.pop()!]
  const startingPlayer = state.round === 0 ? 0 : (state.startingPlayer + 1) % players.length
  return addLog(
    {
      ...state,
      phase: 'setup',
      round: state.round + 1,
      players,
      deck,
      discard,
      currentPlayer: startingPlayer,
      startingPlayer,
      setupReady: [],
      drawn: null,
      drawnFrom: null,
      caboCaller: null,
      finalTurnsRemaining: null,
      reaction: null,
      power: null,
      result: null,
    },
    `Round ${state.round + 1} was dealt.`,
  )
}

function assertPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error('That player is not at this table.')
  return player
}

function assertTurn(state: GameState, playerId: string) {
  if (state.phase !== 'turn') throw new Error('It is not time to take a turn.')
  if (state.players[state.currentPlayer]?.id !== playerId) throw new Error('It is not your turn.')
}

function powerFor(value: number): ResumeAction['power'] | undefined {
  if (value === 7 || value === 8) return 'peek'
  if (value === 9 || value === 10) return 'spy'
  if (value === 11 || value === 12) return 'swap'
  return undefined
}

function openReaction(state: GameState, resume: ResumeAction, message: string): GameState {
  return {
    ...state,
    phase: 'reaction',
    reaction: {
      nonce: uid(),
      passed: [],
      deadline: Date.now() + REACTION_MS,
      resume,
      message,
    },
  }
}

function drawPenalty(state: GameState, playerId: string): GameState {
  if (state.deck.length === 0) return state
  const deck = [...state.deck]
  const penalty = deck.pop()!
  return {
    ...state,
    deck,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, cards: [...player.cards, penalty] } : player,
    ),
  }
}

function finishTurn(state: GameState, actorId: string): GameState {
  if (state.deck.length === 0) return scoreRound(state)

  let finalTurnsRemaining = state.finalTurnsRemaining
  if (state.caboCaller && actorId !== state.caboCaller && finalTurnsRemaining !== null) {
    finalTurnsRemaining -= 1
    if (finalTurnsRemaining <= 0) return scoreRound({ ...state, finalTurnsRemaining })
  }

  let nextIndex = (state.currentPlayer + 1) % state.players.length
  if (state.caboCaller && state.players[nextIndex].id === state.caboCaller) {
    nextIndex = (nextIndex + 1) % state.players.length
  }
  return addLog(
    {
      ...state,
      phase: 'turn',
      currentPlayer: nextIndex,
      drawn: null,
      drawnFrom: null,
      reaction: null,
      power: null,
      finalTurnsRemaining,
    },
    `${state.players[nextIndex].name}'s turn.`,
  )
}

function resumeAfterReaction(state: GameState): GameState {
  const resume = state.reaction?.resume
  if (!resume) return state
  if (resume.kind === 'power' && resume.power) {
    return {
      ...state,
      phase: 'power',
      reaction: null,
      power: { actorId: resume.actorId, kind: resume.power, selected: [] },
    }
  }
  return finishTurn({ ...state, reaction: null }, resume.actorId)
}

function scoreRound(state: GameState): GameState {
  const totals = Object.fromEntries(
    state.players.map((player) => [player.id, player.cards.reduce((sum, card) => sum + card.value, 0)]),
  )
  const changes = { ...totals }
  let caboSucceeded: boolean | undefined
  let kamikaze: string | undefined

  if (state.caboCaller) {
    const caller = state.players.find((player) => player.id === state.caboCaller)!
    const values = caller.cards.map((card) => card.value).sort((a, b) => a - b)
    if (values.join(',') === '12,12,13,13') {
      kamikaze = caller.id
      for (const player of state.players) changes[player.id] = player.id === caller.id ? -50 : 50
    } else {
      const lowest = Math.min(...Object.values(totals))
      caboSucceeded = totals[caller.id] === lowest
      changes[caller.id] = caboSucceeded ? 0 : totals[caller.id] + 5
    }
  }

  const players = state.players.map((player) => {
    let score = player.score + changes[player.id]
    let exactResetUsed = player.exactResetUsed
    if (score === 100 && !exactResetUsed) {
      score = 50
      exactResetUsed = true
    }
    return { ...player, score, exactResetUsed }
  })
  const gameOver = players.some((player) => player.score > 100)
  return addLog(
    {
      ...state,
      players,
      phase: gameOver ? 'gameOver' : 'roundEnd',
      drawn: null,
      drawnFrom: null,
      reaction: null,
      power: null,
      result: { totals, changes, caboSucceeded, kamikaze },
    },
    gameOver ? 'Game over.' : `Round ${state.round} complete.`,
  )
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'join': {
      if (state.phase !== 'waiting' || state.players.length !== 1) throw new Error('This room is full.')
      if (state.players.some((player) => player.id === action.player.id)) return state
      return startRound({
        ...state,
        players: [...state.players, { ...action.player, cards: [], score: 0, exactResetUsed: false }],
        log: [`${action.player.name} joined the table.`, ...state.log],
      })
    }
    case 'setupReady': {
      assertPlayer(state, action.playerId)
      if (state.phase !== 'setup') throw new Error('Setup has already finished.')
      if (state.setupReady.includes(action.playerId)) return state
      const setupReady = [...state.setupReady, action.playerId]
      if (setupReady.length === state.players.length) {
        return addLog({ ...state, setupReady, phase: 'turn' }, `${state.players[state.currentPlayer].name} starts.`)
      }
      return { ...state, setupReady }
    }
    case 'drawDeck': {
      assertTurn(state, action.playerId)
      if (state.drawn) throw new Error('You already drew a card.')
      if (state.deck.length === 0) return scoreRound(state)
      const deck = [...state.deck]
      const drawn = deck.pop()!
      return addLog({ ...state, deck, drawn, drawnFrom: 'deck' }, `${assertPlayer(state, action.playerId).name} drew from the deck.`)
    }
    case 'takeDiscard': {
      assertTurn(state, action.playerId)
      if (state.drawn) throw new Error('You already drew a card.')
      if (state.discard.length === 0) throw new Error('The discard pile is empty.')
      const discard = [...state.discard]
      const drawn = discard.pop()!
      return addLog({ ...state, discard, drawn, drawnFrom: 'discard' }, `${assertPlayer(state, action.playerId).name} took the discard.`)
    }
    case 'exchange': {
      assertTurn(state, action.playerId)
      const player = assertPlayer(state, action.playerId)
      if (!state.drawn || action.cardIds.length === 0) throw new Error('Choose at least one card to exchange.')
      const selected = player.cards.filter((card) => action.cardIds.includes(card.id))
      if (selected.length !== action.cardIds.length) throw new Error('Choose only your own cards.')
      const isMatch = selected.length === 1 || selected.every((card) => card.value === selected[0].value)
      if (!isMatch) {
        const players = state.players.map((candidate) =>
          candidate.id === player.id ? { ...candidate, cards: [...candidate.cards, state.drawn!] } : candidate,
        )
        return finishTurn(
          addLog(
            { ...state, players, drawn: null, drawnFrom: null },
            `${player.name}'s set did not match — the drawn card became a penalty.`,
          ),
          player.id,
        )
      }
      const firstIndex = player.cards.findIndex((card) => action.cardIds.includes(card.id))
      const remaining = player.cards.filter((card) => !action.cardIds.includes(card.id))
      remaining.splice(firstIndex, 0, state.drawn)
      const players = state.players.map((candidate) =>
        candidate.id === player.id ? { ...candidate, cards: remaining } : candidate,
      )
      const label = selected.length > 1 ? `${selected.length}-card set` : 'card'
      return addLog(
        openReaction(
          { ...state, players, discard: [...state.discard, ...selected], drawn: null, drawnFrom: null },
          { kind: 'endTurn', actorId: player.id },
          `${player.name} exchanged a ${label}. Match the ${selected.at(-1)!.value}?`,
        ),
        `${player.name} exchanged a ${label}.`,
      )
    }
    case 'discardDrawn': {
      assertTurn(state, action.playerId)
      const player = assertPlayer(state, action.playerId)
      if (!state.drawn || state.drawnFrom !== 'deck') throw new Error('Only a deck card may be discarded freely.')
      return addLog(
        openReaction(
          { ...state, discard: [...state.discard, state.drawn], drawn: null, drawnFrom: null },
          { kind: 'endTurn', actorId: player.id },
          `${player.name} discarded ${state.drawn.value}. Can you match it?`,
        ),
        `${player.name} discarded ${state.drawn.value}.`,
      )
    }
    case 'usePower': {
      assertTurn(state, action.playerId)
      const player = assertPlayer(state, action.playerId)
      const power = state.drawn && state.drawnFrom === 'deck' ? powerFor(state.drawn.value) : undefined
      if (!state.drawn || !power) throw new Error('That card has no usable power.')
      return addLog(
        openReaction(
          { ...state, discard: [...state.discard, state.drawn], drawn: null, drawnFrom: null },
          { kind: 'power', actorId: player.id, power },
          `${player.name} played ${power}. Match the ${state.drawn.value}?`,
        ),
        `${player.name} played ${power}.`,
      )
    }
    case 'passReaction': {
      if (state.phase !== 'reaction' || !state.reaction) throw new Error('There is no reaction window.')
      assertPlayer(state, action.playerId)
      const passed = [...new Set([...state.reaction.passed, action.playerId])]
      if (passed.length === state.players.length) return resumeAfterReaction(state)
      return { ...state, reaction: { ...state.reaction, passed } }
    }
    case 'closeReaction': {
      if (state.phase !== 'reaction' || !state.reaction) return state
      if (Date.now() < state.reaction.deadline) throw new Error('The reaction window is still open.')
      return resumeAfterReaction(state)
    }
    case 'matchReaction': {
      if (state.phase !== 'reaction' || !state.reaction) throw new Error('Too late — the reaction window closed.')
      if (state.reaction.nonce !== action.nonce) return reduceGame(state, { type: 'lateReaction', playerId: action.playerId })
      const player = assertPlayer(state, action.playerId)
      if (state.reaction.passed.includes(player.id)) throw new Error('You already passed or attempted this match.')
      const card = player.cards.find((candidate) => candidate.id === action.cardId)
      if (!card) throw new Error('That card is no longer available.')
      const top = state.discard.at(-1)
      if (!top) throw new Error('The discard pile is empty.')
      if (card.value !== top.value) {
        const penalized = drawPenalty(state, player.id)
        const passed = [...new Set([...penalized.reaction!.passed, player.id])]
        const updated = {
          ...penalized,
          reaction: { ...penalized.reaction!, passed, message: `${player.name} missed with ${card.value} and took a penalty.` },
        }
        return addLog(
          passed.length === state.players.length ? resumeAfterReaction(updated) : updated,
          `${player.name} missed the match and took a penalty.`,
        )
      }
      const players = state.players.map((candidate) =>
        candidate.id === player.id ? { ...candidate, cards: candidate.cards.filter((item) => item.id !== card.id) } : candidate,
      )
      return addLog(
        {
          ...state,
          players,
          discard: [...state.discard, card],
          reaction: { ...state.reaction, nonce: uid(), passed: [], deadline: Date.now() + REACTION_MS, message: `${player.name} matched ${card.value}! Match again?` },
        },
        `${player.name} matched ${card.value}.`,
      )
    }
    case 'lateReaction': {
      if (state.phase !== 'reaction' || !state.reaction) return state
      const player = assertPlayer(state, action.playerId)
      const penalized = drawPenalty(state, player.id)
      const passed = [...new Set([...penalized.reaction!.passed, player.id])]
      const updated = {
        ...penalized,
        reaction: { ...penalized.reaction!, passed, message: `${player.name} was late and took a penalty.` },
      }
      return addLog(
        passed.length === state.players.length ? resumeAfterReaction(updated) : updated,
        `${player.name} was late to the match and took a penalty.`,
      )
    }
    case 'powerCard': {
      if (state.phase !== 'power' || !state.power || state.power.actorId !== action.playerId) throw new Error('You cannot use this power.')
      const actor = assertPlayer(state, action.playerId)
      const owner = state.players.find((player) => player.cards.some((card) => card.id === action.cardId))
      if (!owner) throw new Error('That card is no longer available.')
      if (state.power.kind === 'peek' && owner.id !== actor.id) throw new Error('Peek only works on your own card.')
      if (state.power.kind === 'spy' && owner.id === actor.id) throw new Error("Spy works on your opponent's card.")
      if (state.power.kind !== 'swap') return finishTurn(state, actor.id)
      const selected = [...state.power.selected, action.cardId]
      if (selected.length < 2) return { ...state, power: { ...state.power, selected } }
      if (selected[0] === selected[1]) throw new Error('Choose two different cards.')
      const [firstId, secondId] = selected
      const firstOwnerIndex = state.players.findIndex((p) => p.cards.some((c) => c.id === firstId))
      const secondOwnerIndex = state.players.findIndex((p) => p.cards.some((c) => c.id === secondId))
      const firstCardIndex = state.players[firstOwnerIndex].cards.findIndex((c) => c.id === firstId)
      const secondCardIndex = state.players[secondOwnerIndex].cards.findIndex((c) => c.id === secondId)
      const players = state.players.map((player) => ({ ...player, cards: [...player.cards] }))
      ;[players[firstOwnerIndex].cards[firstCardIndex], players[secondOwnerIndex].cards[secondCardIndex]] = [
        players[secondOwnerIndex].cards[secondCardIndex],
        players[firstOwnerIndex].cards[firstCardIndex],
      ]
      return finishTurn(addLog({ ...state, players }, `${actor.name} swapped two cards.`), actor.id)
    }
    case 'callCabo': {
      assertTurn(state, action.playerId)
      if (state.drawn) throw new Error('You cannot call Cabo after drawing.')
      const caller = assertPlayer(state, action.playerId)
      const nextIndex = (state.currentPlayer + 1) % state.players.length
      return addLog(
        {
          ...state,
          caboCaller: caller.id,
          finalTurnsRemaining: state.players.length - 1,
          currentPlayer: nextIndex,
        },
        `${caller.name} called CABO! One final turn.`,
      )
    }
    case 'nextRound': {
      assertPlayer(state, action.playerId)
      if (state.phase !== 'roundEnd') throw new Error('The round is not over.')
      return startRound(state)
    }
    default:
      return state
  }
}

export function cardPower(value: number) {
  return powerFor(value)
}

export function createLocalGame(firstName: string, secondName: string): GameState {
  const host = { id: 'local-one', name: firstName || 'Player one' }
  return reduceGame(createGame('LOCAL', host), {
    type: 'join',
    player: { id: 'local-two', name: secondName || 'Player two' },
  })
}
