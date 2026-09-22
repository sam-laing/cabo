export type Suit = 'moon' | 'sun' | 'wave' | 'leaf'

export interface Card {
  id: string
  value: number
  suit: Suit
}

export interface Player {
  id: string
  name: string
  cards: Card[]
  score: number
  exactResetUsed: boolean
}

export type Phase =
  | 'waiting'
  | 'setup'
  | 'turn'
  | 'reaction'
  | 'power'
  | 'roundEnd'
  | 'gameOver'

export interface ResumeAction {
  kind: 'endTurn' | 'power'
  actorId: string
  power?: 'peek' | 'spy' | 'swap'
}

export interface ReactionState {
  nonce: string
  passed: string[]
  deadline: number
  resume: ResumeAction
  message: string
}

export interface PowerState {
  actorId: string
  kind: 'peek' | 'spy' | 'swap'
  selected: string[]
}

export interface RoundResult {
  totals: Record<string, number>
  changes: Record<string, number>
  caboSucceeded?: boolean
  kamikaze?: string
}

export interface GameState {
  code: string
  phase: Phase
  round: number
  players: Player[]
  deck: Card[]
  discard: Card[]
  currentPlayer: number
  startingPlayer: number
  setupReady: string[]
  drawn: Card | null
  drawnFrom: 'deck' | 'discard' | null
  caboCaller: string | null
  finalTurnsRemaining: number | null
  reaction: ReactionState | null
  power: PowerState | null
  result: RoundResult | null
  log: string[]
}

export type GameAction =
  | { type: 'join'; player: Pick<Player, 'id' | 'name'> }
  | { type: 'setupReady'; playerId: string }
  | { type: 'drawDeck'; playerId: string }
  | { type: 'takeDiscard'; playerId: string }
  | { type: 'exchange'; playerId: string; cardIds: string[] }
  | { type: 'discardDrawn'; playerId: string }
  | { type: 'usePower'; playerId: string }
  | { type: 'powerCard'; playerId: string; cardId: string }
  | { type: 'passReaction'; playerId: string }
  | { type: 'closeReaction' }
  | { type: 'matchReaction'; playerId: string; cardId: string; nonce: string }
  | { type: 'lateReaction'; playerId: string }
  | { type: 'callCabo'; playerId: string }
  | { type: 'nextRound'; playerId: string }

export interface RoomRecord {
  code: string
  state: GameState
  version: number
  updated_at?: string
}
