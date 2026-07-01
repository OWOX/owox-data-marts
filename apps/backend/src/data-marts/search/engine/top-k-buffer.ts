interface HeapNode<T> {
  score: number;
  insertionIndex: number;
  value: T;
}

export class TopKBuffer<T> {
  private readonly heap: HeapNode<T>[] = [];
  private insertionIndex = 0;

  constructor(private readonly capacity: number) {}

  add(score: number, value: T): void {
    if (this.capacity <= 0) return;
    this.siftUp({ score, insertionIndex: this.insertionIndex++, value });
    if (this.heap.length > this.capacity) {
      this.popMin();
    }
  }

  drainSorted(): T[] {
    return [...this.heap]
      .sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.insertionIndex - b.insertionIndex
      )
      .map(node => node.value);
  }

  private less(a: HeapNode<T>, b: HeapNode<T>): boolean {
    if (a.score !== b.score) return a.score < b.score;
    return a.insertionIndex > b.insertionIndex;
  }

  private siftUp(node: HeapNode<T>): void {
    this.heap.push(node);
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (!this.less(this.heap[i]!, this.heap[parent]!)) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i]!, this.heap[parent]!];
      i = parent;
    }
  }

  private popMin(): void {
    const last = this.heap.pop()!;
    if (this.heap.length === 0) return;
    this.heap[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < this.heap.length && this.less(this.heap[left]!, this.heap[smallest]!)) {
        smallest = left;
      }
      if (right < this.heap.length && this.less(this.heap[right]!, this.heap[smallest]!)) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest]!, this.heap[i]!];
      i = smallest;
    }
  }
}
