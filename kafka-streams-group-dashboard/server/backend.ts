import type { ClientMessage, Snapshot } from '../shared/types'

/** Source of streams-group state: the in-process simulator or a real broker. */
export interface Backend {
  snapshot(): Snapshot
  handle(msg: ClientMessage): void | Promise<void>
  /** Called every server tick. */
  tick(opts?: { force?: boolean }): void | Promise<void>
  close(): void
}
