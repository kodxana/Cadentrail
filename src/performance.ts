const timings = new Map<string, number[]>();
export function measured(name: string, start: number) {
  const list = timings.get(name) ?? [];
  list.push(performance.now() - start);
  if (list.length > 120) list.shift();
  timings.set(name, list);
}
export function performanceReport() {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    }
  ).memory;
  return {
    time: new Date().toISOString(),
    userAgent: navigator.userAgent,
    visibility: document.visibilityState,
    heapMiB: memory ? memory.usedJSHeapSize / 2 ** 20 : null,
    measurements: Object.fromEntries(
      [...timings].map(([name, list]) => {
        const ordered = [...list].sort((a, b) => a - b);
        return [
          name,
          {
            samples: list.length,
            lastMs: list.at(-1),
            medianMs: ordered[Math.floor(ordered.length / 2)],
            p95Ms:
              ordered[
                Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))
              ],
          },
        ];
      }),
    ),
  };
}
