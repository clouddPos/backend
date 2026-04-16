import { TransactionStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * Transaction State Machine
 *
 * Valid transitions:
 *   INITIATED → AUTHORIZED | DECLINED | FAILED
 *   AUTHORIZED → CAPTURED | REVERSED | FAILED
 *   CAPTURED → SETTLED | REVERSED | FAILED
 *   SETTLED -> REVERSED
 *   DECLINED → (terminal)
 *   REVERSED → (terminal)
 *   FAILED → (terminal)
 */
const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  [TransactionStatus.INITIATED]: [
    TransactionStatus.AUTHORIZED,
    TransactionStatus.DECLINED,
    TransactionStatus.FAILED,
  ],
  [TransactionStatus.AUTHORIZED]: [
    TransactionStatus.CAPTURED,
    TransactionStatus.REVERSED,
    TransactionStatus.FAILED,
  ],
  [TransactionStatus.CAPTURED]: [
    TransactionStatus.SETTLED,
    TransactionStatus.REVERSED,
    TransactionStatus.FAILED,
  ],
  [TransactionStatus.SETTLED]: [TransactionStatus.REVERSED],
  [TransactionStatus.DECLINED]: [],
  [TransactionStatus.REVERSED]: [],
  [TransactionStatus.FAILED]: [],
};

const TERMINAL_STATES: TransactionStatus[] = [
  TransactionStatus.DECLINED,
  TransactionStatus.REVERSED,
  TransactionStatus.FAILED,
];

export class TransactionStateMachine {
  /**
   * Check if a transition is valid.
   */
  static isValidTransition(
    from: TransactionStatus,
    to: TransactionStatus,
  ): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Validate and return the new status, or throw if invalid.
   */
  static transition(
    from: TransactionStatus,
    to: TransactionStatus,
  ): TransactionStatus {
    if (!this.isValidTransition(from, to)) {
      throw new BadRequestException(
        `Invalid transaction state transition: ${from} → ${to}`,
      );
    }
    return to;
  }

  /**
   * Check if a status is terminal.
   */
  static isTerminal(status: TransactionStatus): boolean {
    return TERMINAL_STATES.includes(status);
  }

  /**
   * Get allowed next states for a given status.
   */
  static getAllowedTransitions(status: TransactionStatus): TransactionStatus[] {
    return VALID_TRANSITIONS[status] ?? [];
  }

  /**
   * Find a valid forward path from one status to another.
   * Returns an array of intermediate statuses to apply (excluding the start).
   */
  static getPath(
    from: TransactionStatus,
    to: TransactionStatus,
  ): TransactionStatus[] | null {
    if (from === to) return [];

    const queue: Array<{
      status: TransactionStatus;
      path: TransactionStatus[];
    }> = [{ status: from, path: [] }];
    const visited = new Set<TransactionStatus>([from]);

    while (queue.length > 0) {
      const { status, path } = queue.shift()!;
      for (const next of this.getAllowedTransitions(status)) {
        if (visited.has(next)) continue;
        const nextPath = [...path, next];
        if (next === to) return nextPath;
        visited.add(next);
        queue.push({ status: next, path: nextPath });
      }
    }

    return null;
  }
}
