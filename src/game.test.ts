import { describe, expect, it } from 'vitest'
import { createLocalGame, reduceGame } from './game'
import type { Card, GameState } from './types'

const card = (id: string, value: number): Card => ({ id, value, suit: 'moon' })

function readyGame() {
  let game = createLocalGame('Anna', 'Mia')
  game = reduceGame(game, { type: 'setupReady', playerId: 'local-one' })
  game = reduceGame(game, { type: 'setupReady', playerId: 'local-two' })
  return game
}

describe('Cabo game engine', () => {
  it('deals four cards each and starts after both players are ready', () => {
    const game = readyGame()
    expect(game.phase).toBe('turn')
    expect(game.players.map((player) => player.cards.length)).toEqual([4, 4])
    expect(game.deck).toHaveLength(47)
    expect(game.discard).toHaveLength(1)
  })

  it('exchanges one card and advances after both players pass the reaction', () => {
    let game = readyGame()
    const oldCard = game.players[0].cards[0]
    game = reduceGame(game, { type: 'drawDeck', playerId: 'local-one' })
    const drawnId = game.drawn!.id
    game = reduceGame(game, { type: 'exchange', playerId: 'local-one', cardIds: [oldCard.id] })
    expect(game.phase).toBe('reaction')
    expect(game.players[0].cards.some((item) => item.id === drawnId)).toBe(true)
    game = reduceGame(game, { type: 'passReaction', playerId: 'local-one' })
    game = reduceGame(game, { type: 'passReaction', playerId: 'local-two' })
    expect(game.phase).toBe('turn')
    expect(game.currentPlayer).toBe(1)
  })

  it('keeps a failed set and adds the drawn card as its penalty', () => {
    let game = readyGame()
    game = {
      ...game,
      drawn: card('drawn', 2),
      drawnFrom: 'deck',
      players: game.players.map((player, index) => index === 0 ? { ...player, cards: [card('a', 3), card('b', 4)] } : player),
    }
    game = reduceGame(game, { type: 'exchange', playerId: 'local-one', cardIds: ['a', 'b'] })
    expect(game.players[0].cards.map((item) => item.id)).toEqual(['a', 'b', 'drawn'])
    expect(game.phase).toBe('turn')
    expect(game.currentPlayer).toBe(1)
  })

  it('removes a correct reaction match and resets the chain timer', () => {
    let game = readyGame()
    game = {
      ...game,
      phase: 'reaction',
      discard: [card('top', 6)],
      players: game.players.map((player, index) => index === 1 ? { ...player, cards: [card('match', 6)] } : player),
      reaction: { nonce: 'first', passed: [], deadline: Date.now() + 1000, resume: { kind: 'endTurn', actorId: 'local-one' }, message: 'match' },
    }
    game = reduceGame(game, { type: 'matchReaction', playerId: 'local-two', cardId: 'match', nonce: 'first' })
    expect(game.players[1].cards).toHaveLength(0)
    expect(game.discard.at(-1)?.id).toBe('match')
    expect(game.reaction?.nonce).not.toBe('first')
  })

  it('does not let a player act again after passing a reaction', () => {
    let game = readyGame()
    game = {
      ...game,
      phase: 'reaction',
      discard: [card('top', 6)],
      players: game.players.map((player, index) => index === 1 ? { ...player, cards: [card('match', 6)] } : player),
      reaction: { nonce: 'first', passed: ['local-two'], deadline: Date.now() + 1000, resume: { kind: 'endTurn', actorId: 'local-one' }, message: 'match' },
    }
    expect(() => reduceGame(game, { type: 'matchReaction', playerId: 'local-two', cardId: 'match', nonce: 'first' }))
      .toThrow('already passed')
  })

  it('applies the one-time exact-100 reset', () => {
    let game: GameState = readyGame()
    game = {
      ...game,
      deck: [card('last', 2)],
      players: [
        { ...game.players[0], score: 90, cards: [card('five', 5)] },
        { ...game.players[1], cards: [] },
      ],
    }
    game = reduceGame(game, { type: 'callCabo', playerId: 'local-one' })
    game = reduceGame(game, { type: 'drawDeck', playerId: 'local-two' })
    game = reduceGame(game, { type: 'discardDrawn', playerId: 'local-two' })
    game = reduceGame(game, { type: 'passReaction', playerId: 'local-one' })
    game = reduceGame(game, { type: 'passReaction', playerId: 'local-two' })
    expect(game.phase).toBe('roundEnd')
    expect(game.players[0].score).toBe(50)
    expect(game.players[0].exactResetUsed).toBe(true)
  })
})
