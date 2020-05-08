export class Task<T> {
  constructor(
    public type: T,
    public priority: number,
    public creationTime: number = Date.now(),
    public payload: Buffer,
  ) { }
  compare(other: Task<T>): number {
    return this.priority === other.priority
      ? this.creationTime - other.creationTime
      : this.priority - other.priority;
  }
}
