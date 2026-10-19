// Test plan rows for docs/specs/008-cluster-overview/spec.md (rendered by `bun run docs:test-plan`).
// CL2: live brokers "<id>:<rack>", the controller, partitions "<topic>-<p> L<leader> R<replicas> I<isr>" (; separated,
// leader -1 = none) and disk "<id>=<bytes>" ("-" = DescribeLogDirs refused) → broker cards, totals, attention list.
// Cards: "<id>[ offline][ ctl] <rack> L<leaders> R<replicas> d<bytes|->".

export interface ClusterCase {
  id: string
  case: string
  brokers: string
  controller: string
  partitions: string
  disk: string
  cards: string
  totals: string
  attention: string
}

const row = (c: string, brokers: string, controller: string, partitions: string, disk: string, cards: string, totals: string, attention: string): ClusterCase =>
  ({ id: 'CL2', case: c, brokers, controller, partitions, disk, cards, totals, attention })

export const testPlanRows: ClusterCase[] = [
  row('three healthy brokers', '1:a 2:b 3:c', '3', 't-0 L1 R1,2,3 I1,2,3; t-1 L2 R2,3,1 I2,3,1', '1=10 2=20 3=30',
    '1 a L1 R2 d10 | 2 b L1 R2 d20 | 3 ctl c L0 R2 d30', 'brokers 3/3 topics 1 partitions 2 ur 0 off 0', ''),
  row('a stopped broker stays as an offline card from the replica lists', '1:a 2:b', '2', 't-0 L1 R1,2,3 I1,2; t-1 L2 R2,3,1 I2,1', '1=10 2=20',
    '1 a L1 R2 d10 | 2 ctl b L1 R2 d20 | 3 offline - L0 R2 d-', 'brokers 2/3 topics 1 partitions 2 ur 2 off 0', 't-0 ur -3 | t-1 ur -3'),
  row('an offline partition comes first', '1:a 2:b', '1', 'a-0 L1 R1,2 I1; b-0 L-1 R3 I', '1=1 2=2',
    '1 ctl a L1 R1 d1 | 2 b L0 R1 d2 | 3 offline - L0 R1 d-', 'brokers 2/3 topics 2 partitions 2 ur 1 off 1', 'b-0 offline | a-0 ur -2'),
  row('then by topic and numeric partition', '1:a 2:b', '1', 'b-1 L1 R1,2 I1; a-10 L1 R1,2 I1; a-2 L1 R1,2 I1', '-',
    '1 ctl a L3 R3 d- | 2 b L0 R3 d-', 'brokers 2/2 topics 2 partitions 3 ur 3 off 0', 'a-2 ur -2 | a-10 ur -2 | b-1 ur -2'),
  row('no controller and no rack', '1:- 2:-', '-', 't-0 L2 R1,2 I1,2', '1=0 2=0',
    '1 - L0 R1 d0 | 2 - L1 R1 d0', 'brokers 2/2 topics 1 partitions 1 ur 0 off 0', ''),
]
