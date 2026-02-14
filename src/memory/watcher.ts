import * as path from "node:path";
import { watch, type FSWatcher } from "chokidar";

export type WatcherOptions = {
  workspaceDir: string;
  debounceMs: number;
  onDirty: () => void;
};

export class MemoryWatcher {
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private opts: WatcherOptions;

  constructor(opts: WatcherOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.watcher) return;

    const watchPaths = [
      path.join(this.opts.workspaceDir, "MEMORY.md"),
      path.join(this.opts.workspaceDir, "memory.md"),
      path.join(this.opts.workspaceDir, "memory"),
    ];

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.opts.debounceMs,
        pollInterval: 100,
      },
    });

    const markDirty = () => this.scheduleDirty();

    this.watcher.on("add", markDirty);
    this.watcher.on("change", markDirty);
    this.watcher.on("unlink", markDirty);
  }

  private scheduleDirty(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.opts.onDirty();
    }, this.opts.debounceMs);
  }

  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
