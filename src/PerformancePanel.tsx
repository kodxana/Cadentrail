import { useEffect, useState } from "react";
import { performanceReport, measured } from "./performance";
import { download } from "./api";
import { engine } from "./audio";
export function PerformancePanel() {
  const [report, setReport] = useState(performanceReport());
  useEffect(() => {
    let frame = 0,
      last = 0;
    const tick = (time: number) => {
      if (last) measured("Animation frame interval", last);
      last = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = setInterval(() => setReport(performanceReport()), 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);
  const snapshot = () => ({
    ...performanceReport(),
    audio: {
      contextRate: engine.ctx?.sampleRate,
      baseLatency: engine.ctx?.baseLatency,
      outputLatency: engine.ctx?.outputLatency,
      bufferMiB: engine.bytes / 2 ** 20,
      underruns: engine.underruns,
    },
  });
  return (
    <details className="analysis-notes">
      <summary>Browser performance · measured on this device</summary>
      <p>
        Heap {report.heapMiB?.toFixed(1) ?? "unavailable"} MiB · decoded audio
        cache {(engine.bytes / 2 ** 20).toFixed(1)} MiB · late segments{" "}
        {engine.underruns}
      </p>
      <table>
        <thead>
          <tr>
            <th>Measurement</th>
            <th>Median</th>
            <th>95th percentile</th>
            <th>Samples</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(report.measurements).map(([name, m]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{m.medianMs.toFixed(2)} ms</td>
              <td>{m.p95Ms.toFixed(2)} ms</td>
              <td>{m.samples}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">
        Frame intervals reflect browser visibility and display refresh rate.
        Heap excludes native audio buffers. Measurements cover recent activity,
        not a hardware guarantee.
      </p>
      <button
        onClick={() =>
          download(
            "browser-performance.json",
            JSON.stringify(snapshot(), null, 2),
          )
        }
      >
        Download measurements
      </button>
    </details>
  );
}
