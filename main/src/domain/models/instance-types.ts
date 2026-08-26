export type WorkMode = 'personal' | 'group' | 'public'
export type InstanceLifecycleStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
export type PersonalUserBotStatus = 'disabled' | 'not-configured' | 'starting' | 'running' | 'stopped' | 'error'

export interface PersonalModeDiagnostics {
  workMode: WorkMode
  userBotRequired: boolean
  userSessionId: number | null
  userBotStatus: PersonalUserBotStatus
  hasTgUserBot: boolean
  canAutoProvisionPairs: boolean
  manualPairingAvailable: boolean
  reason?: string
  error?: string
}
