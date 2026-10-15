// Test plan rows for docs/specs/001-real-broker/spec.md (rendered by `bun run docs:test-plan`).
// RB6 / RB12: mapping broker data to the dashboard view. RB15: events derived between two polls.

import type { GroupState, MemberState, MemberView } from '../../shared/types'

export interface MappingCase {
  id: string
  case: string
  /** Member assignment / target as "active|standby" task lists, e.g. "0_0,0_1|1_0". */
  assignment: string
  target: string
  clientId: string
  killed: boolean
  brokerState: string
  expectedLabel: string
  expectedMemberState: MemberState
  expectedStatus: MemberView['status']
  expectedGroupState: GroupState
  expectedPendingRevocation: string
}

const defaults: Omit<MappingCase, 'id' | 'case' | 'assignment' | 'target' | 'expectedMemberState'> = {
  clientId: 'word-count-process-A-StreamThread-1-consumer',
  killed: false,
  brokerState: 'STABLE',
  expectedLabel: 'process-A',
  expectedStatus: 'alive',
  expectedGroupState: 'STABLE',
  expectedPendingRevocation: '|',
}

// Fixed key order so the rendered table reads id → input → expected.
const row = (c: Partial<MappingCase> & Pick<MappingCase, 'id' | 'case' | 'assignment' | 'target' | 'expectedMemberState'>): MappingCase => {
  const r = { ...defaults, ...c }
  return {
    id: r.id,
    case: r.case,
    assignment: r.assignment,
    target: r.target,
    clientId: r.clientId,
    killed: r.killed,
    brokerState: r.brokerState,
    expectedLabel: r.expectedLabel,
    expectedMemberState: r.expectedMemberState,
    expectedPendingRevocation: r.expectedPendingRevocation,
    expectedStatus: r.expectedStatus,
    expectedGroupState: r.expectedGroupState,
  }
}

export const testPlanRows: MappingCase[] = [
  row({ id: 'RB6', case: 'assignment equals target', assignment: '0_0,0_1|', target: '0_1,0_0|', expectedMemberState: 'STABLE' }),
  row({ id: 'RB6', case: 'owns a task no longer in target', assignment: '0_0,0_1|', target: '0_0|', expectedMemberState: 'UNREVOKED_TASKS', expectedPendingRevocation: '0_1|' }),
  row({ id: 'RB6', case: 'owns a standby no longer in target', assignment: '0_0|1_0', target: '0_0|', expectedMemberState: 'UNREVOKED_TASKS', expectedPendingRevocation: '|1_0' }),
  row({ id: 'RB6', case: 'target task not owned yet', assignment: '0_0|', target: '0_0,0_1|', expectedMemberState: 'UNRELEASED_TASKS' }),
  row({ id: 'RB6', case: 'revoke and receive at once: revoke wins', assignment: '0_0|', target: '0_1|', expectedMemberState: 'UNREVOKED_TASKS', expectedPendingRevocation: '0_0|' }),
  row({ id: 'RB6', case: 'process label with dashes', assignment: '|', target: '|', clientId: 'word-count-process-B-2-StreamThread-3-consumer', expectedLabel: 'process-B-2', expectedMemberState: 'STABLE' }),
  row({ id: 'RB6', case: 'foreign client.id falls back to broker processId', assignment: '|', target: '|', clientId: 'someone-else', expectedLabel: 'uuid-1', expectedMemberState: 'STABLE' }),
  row({ id: 'RB6', case: 'process killed by the dashboard', assignment: '0_0|', target: '0_0|', killed: true, expectedStatus: 'crashed', expectedMemberState: 'STABLE' }),
  row({ id: 'RB12', case: 'broker state NOT_READY (missing source topics)', assignment: '|', target: '|', brokerState: 'NOT_READY', expectedGroupState: 'NOT_READY', expectedMemberState: 'STABLE' }),
  row({ id: 'RB12', case: 'broker state DEAD', assignment: '|', target: '|', brokerState: 'DEAD', expectedGroupState: 'EMPTY', expectedMemberState: 'STABLE' }),
  row({ id: 'RB12', case: 'broker state RECONCILING', assignment: '|', target: '|', brokerState: 'RECONCILING', expectedGroupState: 'RECONCILING', expectedMemberState: 'STABLE' }),
]
