// Test plan rows for docs/specs/001-real-broker/spec.md (rendered by `bun run docs:test-plan`).
// RB15: coordinator-log events derived by diffing two consecutive inspector polls.

export type Change =
  | 'none'
  | 'first poll'
  | 'member joined'
  | 'member left'
  | 'group state changed'
  | 'group epoch bumped'
  | 'target assignment epoch bumped'
  | 'member assignment changed'
  | 'member standby changed'
  | 'member epoch bumped'

export interface EventCase {
  id: string
  change: Change
  expectedKinds: string
  expectedMessageContains: string
}

export const testPlanRows: EventCase[] = [
  { id: 'RB15', change: 'none', expectedKinds: '', expectedMessageContains: '' },
  { id: 'RB15', change: 'first poll', expectedKinds: 'member', expectedMessageContains: 'm-1 joined (process-A' },
  { id: 'RB15', change: 'member joined', expectedKinds: 'member', expectedMessageContains: 'm-2 joined (process-B' },
  { id: 'RB15', change: 'member left', expectedKinds: '', expectedMessageContains: '' },
  { id: 'RB15', change: 'group state changed', expectedKinds: 'epoch', expectedMessageContains: 'STABLE → RECONCILING' },
  { id: 'RB15', change: 'group epoch bumped', expectedKinds: 'epoch', expectedMessageContains: 'group epoch → 4' },
  { id: 'RB15', change: 'target assignment epoch bumped', expectedKinds: 'assignor', expectedMessageContains: 'target assignment epoch 4' },
  { id: 'RB15', change: 'member assignment changed', expectedKinds: 'heartbeat', expectedMessageContains: 'm-1 memberEpoch=3 active=[0_0]' },
  { id: 'RB15', change: 'member standby changed', expectedKinds: 'heartbeat', expectedMessageContains: 'm-1 memberEpoch=3 active=[0_0] standby=[1_0]' },
  { id: 'RB15', change: 'member epoch bumped', expectedKinds: 'heartbeat', expectedMessageContains: 'm-1 memberEpoch=4' },
]
