# task-farm

A dead simple and opinionated priority queue task farm.

## Usage

Create a single file that configures your work farm.

```ts
// src/workfarm.ts
import { TaskFarm } from "task-farm";

// create a single module for task farm creation (so you can use this for the worker thread)
const farm = new TaskFarm<TaskType>({
  __filename, // pass this filename
  payloadSize: 0x10000, // allocate a single buffer to pass to the workers and back
  argv: process.argv,
  env: process.env,
  stdout: true,
  stderr: true,
});

farm.addTaskType(
  // TaskType here
  TaskType.Example,
  // Priority (lower means run sooner)
  1,
  // This function runs in the worker
  (buffer: Buffer, farm: TaskFarm<TaskType>) => {
    // buffer contains worker payload
    // write result data back to the same buffer
  },
  // This function runs in the main thread
  (buffer: Buffer, farm: TaskFarm<TaskType>) => {
    // buffer contains result of worker
    // copy data immediately
  },
);

// pass a buffer to the task
farm.delegate(TaskType.Example, Buffer.from([...data]));
```