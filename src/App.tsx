import { useCallback, useEffect, useRef, useState } from 'react'
import { GameBoard } from './components/GameBoard'
import { Landing } from './components/Landing'
import { createLocalGame, reduceGame } from './game'
import { applyRoomAction, createRoom, fetchRoom, onlineAvailable, subscribeRoom, unsubscribeRoom } from './online'
import type { GameAction, GameState, RoomRecord } from './types'

type Session =
  | { kind: 'local'; state: GameState; viewerId: string }
  | { kind: 'online'; room: RoomRecord; viewerId: string }

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => alphabet[value % alphabet.length]).join('')
}

function storedIdentity(code: string) {
  try { return JSON.parse(localStorage.getItem(`cabo-room:${code}`) ?? 'null') as { id: string; name: string } | null } catch { return null }
}

function rememberIdentity(code: string, identity: { id: string; name: string }) {
  localStorage.setItem(`cabo-room:${code}`, JSON.stringify(identity))
}

export default function App() {
  const initialCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(true)
  const onlineRoomCode = session?.kind === 'online' ? session.room.code : null

  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    if (!initialCode || !onlineAvailable) return
    const identity = storedIdentity(initialCode)
    if (!identity) return
    let active = true
    setBusy(true)
    void fetchRoom(initialCode)
      .then((room) => {
        if (active && room.state.players.some((player) => player.id === identity.id)) {
          setSession({ kind: 'online', room, viewerId: identity.id })
        }
      })
      .catch(() => { /* the join form remains available */ })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [initialCode])

  useEffect(() => {
    if (!onlineRoomCode) return
    setConnected(false)
    const channel = subscribeRoom(
      onlineRoomCode,
      (room) => setSession((previous) => previous?.kind === 'online' && room.version > previous.room.version ? { ...previous, room } : previous),
      setConnected,
    )
    return () => { void unsubscribeRoom(channel) }
  }, [onlineRoomCode])

  const dispatch = useCallback(async (action: GameAction) => {
    const active = sessionRef.current
    if (!active) return
    setError('')
    if (active.kind === 'local') {
      try {
        const state = reduceGame(active.state, action)
        setSession({ ...active, state })
        sessionRef.current = { ...active, state }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That move did not work.')
      }
      return
    }
    try {
      const room = await applyRoomAction(active.room, action)
      setSession({ ...active, room })
      sessionRef.current = { ...active, room }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'That move did not work.'
      if (!(action.type === 'closeReaction' && message.includes('changed'))) setError(message)
      try {
        const room = await fetchRoom(active.room.code)
        setSession({ ...active, room })
        sessionRef.current = { ...active, room }
      } catch { /* keep the last playable snapshot */ }
    }
  }, [])

  async function createOnline(name: string) {
    setBusy(true); setError('')
    const code = roomCode()
    const identity = { id: crypto.randomUUID(), name: name.trim() }
    try {
      const room = await createRoom(code, identity)
      rememberIdentity(code, identity)
      window.history.replaceState({}, '', `${window.location.pathname}?room=${code}`)
      setSession({ kind: 'online', room, viewerId: identity.id })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the room.') }
    finally { setBusy(false) }
  }

  async function joinOnline(name: string, rawCode: string) {
    setBusy(true); setError('')
    const code = rawCode.trim().toUpperCase()
    try {
      let room = await fetchRoom(code)
      let identity = storedIdentity(code)
      if (!identity || !room.state.players.some((player) => player.id === identity!.id)) {
        if (room.state.players.length >= 2) throw new Error('This room already has two players.')
        identity = { id: crypto.randomUUID(), name: name.trim() }
        room = await applyRoomAction(room, { type: 'join', player: identity })
        rememberIdentity(code, identity)
      }
      window.history.replaceState({}, '', `${window.location.pathname}?room=${code}`)
      setSession({ kind: 'online', room, viewerId: identity.id })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not join the room.') }
    finally { setBusy(false) }
  }

  function leave() {
    setSession(null)
    sessionRef.current = null
    setError('')
    window.history.replaceState({}, '', window.location.pathname)
  }

  if (!session) return <Landing initialCode={initialCode} busy={busy} error={error} onCreate={createOnline} onJoin={joinOnline} onLocal={(first, second) => setSession({ kind: 'local', state: createLocalGame(first.trim(), second.trim()), viewerId: 'local-one' })} />

  return <GameBoard game={session.kind === 'local' ? session.state : session.room.state} viewerId={session.viewerId} local={session.kind === 'local'} connected={connected} error={error} dispatch={dispatch} onLeave={leave} />
}
