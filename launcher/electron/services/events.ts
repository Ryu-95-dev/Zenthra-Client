import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { AuthState, GameState, LogLine, TaskProgress } from '../../../shared/types';

interface BusEvents {
  task: [TaskProgress];
  log: [LogLine];
  game: [GameState];
  auth: [AuthState];
  profiles: [];
}

/** Process-wide event bus forwarded to the renderer by main.ts. */
export const bus = new EventEmitter<BusEvents>();

/** Tasks still running, so the UI can cancel them by id. */
const running = new Map<string, Task>();

/**
 * Reports the progress of a long-running operation. A cancellable task
 * exposes an AbortSignal that downloads and child processes listen to.
 */
export class Task {
  readonly id = crypto.randomUUID();
  readonly startedAt = Date.now();
  private lastEmit = 0;
  private readonly controller = new AbortController();

  constructor(
    private label: string,
    readonly cancellable = false,
  ) {
    running.set(this.id, this);
    this.update(-1);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get cancelled(): boolean {
    return this.controller.signal.aborted;
  }

  cancel(): void {
    if (this.cancellable) this.controller.abort();
  }

  update(progress: number, detail?: string, force = false): void {
    const now = Date.now();
    // Throttle to ~10 updates per second to keep IPC cheap.
    if (!force && now - this.lastEmit < 100 && progress < 1) return;
    this.lastEmit = now;
    bus.emit('task', { taskId: this.id, label: this.label, progress, detail, cancellable: this.cancellable && !this.cancelled });
  }

  relabel(label: string): void {
    this.label = label;
    this.update(-1, undefined, true);
  }

  done(detail?: string): void {
    running.delete(this.id);
    bus.emit('task', { taskId: this.id, label: this.label, progress: 1, detail, done: true });
  }

  fail(error: string): void {
    running.delete(this.id);
    bus.emit('task', { taskId: this.id, label: this.label, progress: 1, error: this.cancelled ? 'Annulé.' : error, done: true });
  }
}

export function cancelTask(id: string): boolean {
  const t = running.get(id);
  if (!t?.cancellable) return false;
  t.cancel();
  return true;
}

export function launcherLog(text: string): void {
  bus.emit('log', { ts: Date.now(), stream: 'launcher', text });
}
