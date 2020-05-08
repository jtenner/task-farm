import { workerData, Worker, isMainThread, WorkerOptions, parentPort } from "worker_threads";
import TinyQueue from "tinyqueue";
import { TaskState } from "./TaskState";
import { Task } from "./Task";
import { PayloadCallback, TaskFarmProps } from "./util";

export class TaskFarm<T extends number> {
  private workers: Worker[] = [];
  private workerCount: number = 0;
  private roundRobinStart: number = 0;
  private workerID: number = 0;
  private semaphore: Int32Array;
  private payload: Buffer | null = null;
  private priorities = new Map<T, number>();
  private payloads: Buffer[] = [];
  private tasks = new Map<T, PayloadCallback<T>>();
  private callbacks = new Map<T, PayloadCallback<T>>();
  private queue = new TinyQueue<Task<T>>([], (a, b) => a.compare(b));


  constructor(props: TaskFarmProps) {
    if (isMainThread) {
      const workerCount = typeof props.workers === "number"
        ? props.workers
        : require("os").cpus().length;
      const semaphore = new SharedArrayBuffer(workerCount * 4 * 2); // workerCount * 32 bit integers * 2
      this.semaphore = new Int32Array(semaphore);
      for (let i = 0; i < workerCount; i++) {
        const theProps: WorkerOptions = Object.assign({}, props);
        const payload = new SharedArrayBuffer(props.payloadSize);
        theProps.workerData = {
          workerID: i,
          semaphore,
          payload,
        };
        const theWorker = new Worker(props.__filename, theProps);
        this.workers.push(theWorker);
        this.payloads.push(Buffer.from(payload));
        theWorker.ref();
        // theWorker.on("message", (e) => console.log(`worker ${i}`, e));
      }
      this.workerCount = workerCount;
      this.workers.push(...this.workers);
    } else {
      this.workerID = workerData.workerID;
      this.semaphore = new Int32Array(workerData.semaphore);
      this.payload = Buffer.from(workerData.payload);
      parentPort!.ref();
    }
  }

  public addTaskType(id: T, priority: number, task: PayloadCallback<T>, callback: PayloadCallback<T>): this {
    if (isMainThread) {
      this.callbacks.set(id, callback);
      this.priorities.set(id, priority);
    } else {
      this.tasks.set(id, task);
    }
    return this;
  }

  public delegate(id: T, payload: Buffer): void {
    if (isMainThread) {
      this.queue.push(new Task<T>(
        id,
        this.priorities.get(id)!,
        Date.now(),
        payload,
      ));
    }
  }

  public tick(): void {
    if (isMainThread) {
      // check for completed tasks and finish them
      this.checkCompletedTasks();

      // if it's complete, call the callback
      while (this.queue.length) {
        if (this.popTask()) continue;
        // all the threads are working
        return;
      }
    } else {
      const index = this.workerID << 1;
      // we are on the worker thread
      const beforeState = Atomics.compareExchange(this.semaphore, index, TaskState.Start, TaskState.Working);
      if (beforeState === TaskState.Start) {
        // we are now working
        return this.performTask();
      }

      for (let i = 0; i < 4; i++) {
        const result = Atomics.wait(this.semaphore, index, TaskState.Start, 5);
        if (result === "ok") {
          return this.performTask();
        }
      }
    }
  }

  private checkCompletedTasks() {
    for (let i = 0; i < this.workerCount; i++) {
      const index = i << 1;
      const state = Atomics.load(this.semaphore, index);
      const taskType = Atomics.load(this.semaphore, index + 1) as T;
      if (state === TaskState.Complete) {
        const callback = this.callbacks.get(taskType)!;
        callback(this.payloads[i], this);
        this.semaphore[index] = TaskState.Ready;
      }
    }
  }

  private popTask(): boolean {
    const length = this.workerCount;
    const start = this.roundRobinStart;

    for (let i = 0; i < length; i++) {
      const workerID = (start + i) % length;
      const index = workerID << 1;
      const state = Atomics.load(this.semaphore, index);

      // if the thread is working, look for the next one
      if (state === TaskState.Ready) {
        const task = this.queue.pop();
        const payload = this.payloads[i];
        payload.fill(0);
        this.payloads[workerID].set(task!.payload);
        // we are ready or complete, now delegate a task
        Atomics.store(this.semaphore, index, TaskState.Start);
        Atomics.store(this.semaphore, index + 1, task!.type);
        Atomics.notify(this.semaphore, index, 1);
        this.roundRobinStart = (start + i + 1) % length;
        return true;
      }
    }
    return false;
  }


  private performTask(): void {
    const index = this.workerID << 1;
    const type = Atomics.load(this.semaphore, index + 1) as T;
    const callback = this.tasks.get(type)!;
    callback(this.payload!, this);
    parentPort!.postMessage("Work completed on " + this.workerID);
    Atomics.store(this.semaphore, index, TaskState.Complete);
  }

  private cb: () => void = () => {};
  public autoTick(ms: number = 0): void {
    this.cb = this.autoTick.bind(this, ms);
    this.tick();
    setTimeout(this.cb, ms);
  }
  // public delegate
}