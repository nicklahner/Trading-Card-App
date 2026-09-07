export interface JobQueue {
  enqueue(job: string, payload: Record<string, unknown>): Promise<void>;
}

type JobHandler = (payload: Record<string, unknown>) => void | Promise<void>;

export class LocalQueue implements JobQueue {
  private handlers = new Map<string, JobHandler>();

  register(job: string, handler: JobHandler): void {
    this.handlers.set(job, handler);
  }

  async enqueue(job: string, payload: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(job);
    if (!handler) {
      console.warn(`[LocalQueue] No handler registered for job "${job}"`);
      return;
    }
    setTimeout(() => {
      Promise.resolve(handler(payload)).catch((err) => {
        console.error(`[LocalQueue] Job "${job}" failed:`, err);
      });
    }, 0);
  }
}
