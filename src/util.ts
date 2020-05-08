import { WorkerOptions } from "worker_threads";
import { TaskFarm } from "./TaskFarm";

export interface RequiredTaskFarmProps {
  __filename: string;
  payloadSize: number;
}

export interface OptionalTaskFarmProps {
  workers: number;
}

export type PayloadCallback<T extends number> = (input: Buffer, farm: TaskFarm<T>) => void;
export type TaskFarmProps = RequiredTaskFarmProps & Partial<OptionalTaskFarmProps> & WorkerOptions;
