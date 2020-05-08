import { TaskFarm } from "./";

const enum TaskType {
  RandFloat,
}

const farm = new TaskFarm<TaskType>({
  __filename,
  payloadSize: 8,
  argv: process.argv,
  env: process.env,
  stdout: true,
  stderr: true,
});

let count = 0;
farm.addTaskType(
  TaskType.RandFloat,
  1,
  (buffer) => buffer.writeDoubleLE(Math.random()),
  (buffer) => {
    console.log(buffer.readDoubleLE());
    count++;
    if (count === 100) {
      console.log("Done!");
      process.exit(0);
    }
  }
);

const zero = Buffer.of(0, 0, 0, 0, 0, 0, 0, 0);

for (let i = 0; i < 100; i++)
  farm.delegate(TaskType.RandFloat, zero);

farm.autoTick();
