/**
 * Executa `worker` sobre `items` com no máximo `concurrency` tarefas simultâneas.
 * Diferente de processar em lotes, uma tarefa lenta não segura as demais.
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!shouldStop()) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/** Fila assíncrona simples (produtor/consumidor) para ligar a coleta à validação sem esperar lotes. */
export class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: Array<(value: T | undefined) => void> = [];
  private closed = false;

  push(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(item);
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter(undefined);
  }

  next(): Promise<T | undefined> {
    if (this.items.length > 0) return Promise.resolve(this.items.shift());
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}
