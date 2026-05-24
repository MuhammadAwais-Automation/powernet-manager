export const MAX_REALTIME_RETRIES = 8
export const POLLING_ACTIVATION_MS = 12_000
export const POLLING_INTERVAL_MS = 10_000

export function isUnhealthyRealtimeStatus(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
}

export function getReconnectDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt))
  return Math.min(1000 * 2 ** normalizedAttempt, 30_000)
}

export function shouldUsePollingFallback(input: {
  billingConnected: boolean
  complaintsConnected: boolean
}): boolean {
  return !input.billingConnected || !input.complaintsConnected
}
