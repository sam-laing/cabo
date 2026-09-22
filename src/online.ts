import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { createGame, reduceGame } from './game'
import type { GameAction, GameState, RoomRecord } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const onlineAvailable = Boolean(url && anonKey)
const client: SupabaseClient | null = onlineAvailable ? createClient(url!, anonKey!) : null

function requireClient() {
  if (!client) throw new Error('Online play is not configured on this deployment.')
  return client
}

export async function createRoom(code: string, player: { id: string; name: string }) {
  const state = createGame(code, player)
  const { data, error } = await requireClient()
    .from('games')
    .insert({ code, state, version: 1 })
    .select()
    .single<RoomRecord>()
  if (error) throw new Error(error.code === '23505' ? 'That room code is already in use.' : error.message)
  return data
}

export async function fetchRoom(code: string) {
  const { data, error } = await requireClient().from('games').select().eq('code', code).single<RoomRecord>()
  if (error) throw new Error(error.code === 'PGRST116' ? 'Room not found.' : error.message)
  return data
}

async function commit(code: string, version: number, state: GameState) {
  const { data, error } = await requireClient().rpc('update_game', {
    p_code: code,
    p_expected_version: version,
    p_state: state,
  })
  if (error) throw new Error(error.message)
  const record = (data as RoomRecord[] | null)?.[0]
  if (!record) throw new Error('CONFLICT')
  return record
}

export async function applyRoomAction(room: RoomRecord, action: GameAction): Promise<RoomRecord> {
  const next: GameState = reduceGame(room.state, action)
  try {
    return await commit(room.code, room.version, next)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'CONFLICT') throw error
    const fresh = await fetchRoom(room.code)
    if (action.type === 'closeReaction' && fresh.state.phase !== 'reaction') return fresh
    if (action.type === 'setupReady' && fresh.state.phase !== 'setup') return fresh
    if (action.type === 'passReaction' && fresh.state.phase !== 'reaction') return fresh
    if (!['matchReaction', 'setupReady', 'passReaction', 'closeReaction'].includes(action.type)) {
      throw new Error('The table changed — try that move again.')
    }
    const lateState = reduceGame(fresh.state, action)
    return commit(fresh.code, fresh.version, lateState)
  }
}

export function subscribeRoom(code: string, onRoom: (room: RoomRecord) => void, onStatus: (connected: boolean) => void): RealtimeChannel {
  return requireClient()
    .channel(`game:${code}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: `code=eq.${code}` },
      (payload) => onRoom(payload.new as RoomRecord),
    )
    .subscribe((status) => onStatus(status === 'SUBSCRIBED'))
}

export function unsubscribeRoom(channel: RealtimeChannel) {
  return requireClient().removeChannel(channel)
}
