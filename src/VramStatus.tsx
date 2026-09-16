import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { api } from "./api";
type Device = {
  index: string;
  name: string;
  usedBytes: number;
  totalBytes: number;
  utilization: number | null;
  temperature: number | null;
};
type Telemetry = {
  available: boolean;
  devices: Device[];
  sampledAt: number | null;
  message: string | null;
};
const gib = (n: number) => (n / 2 ** 30).toFixed(1);
export function VramStatus() {
  const [data, setData] = useState<Telemetry | null>(null),
    [connected, setConnected] = useState(true);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      if (stopped) return;
      try {
        if (document.visibilityState !== "hidden") {
          const next = await api<Telemetry>("/gpu", {
            signal: controller.signal,
          });
          if (!stopped) {
            setData(next);
            setConnected(true);
          }
        }
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  const gpu = data?.devices[0],
    fresh =
      connected && !!data?.sampledAt && Date.now() / 1000 - data.sampledAt < 8;
  return (
    <details className={"vram-status" + (!fresh ? " stale" : "")}>
      <summary aria-label="Live GPU memory">
        <Cpu size={12} />
        <span>
          {gpu
            ? `VRAM ${gib(gpu.usedBytes)} / ${gib(gpu.totalBytes)} GiB${fresh ? "" : " · stale"}`
            : data
              ? (data.message ?? "VRAM unavailable")
              : "Checking VRAM…"}
        </span>
        {gpu && (
          <span className="vram-meter">
            <i
              style={{
                width: `${Math.min(100, (gpu.usedBytes / gpu.totalBytes) * 100)}%`,
              }}
            />
          </span>
        )}
      </summary>
      <div className="vram-popover">
        <strong>GPU memory</strong>
        {data?.devices.map((d) => (
          <section key={d.index}>
            <b>{d.name}</b>
            <span>
              {gib(d.usedBytes)} GiB used ·{" "}
              {gib(Math.max(0, d.totalBytes - d.usedBytes))} GiB free
            </span>
            <span>
              GPU activity{" "}
              {d.utilization === null
                ? "unavailable"
                : d.utilization.toFixed(0) + "%"}
              {d.temperature !== null ? ` · ${d.temperature.toFixed(0)}°C` : ""}
            </span>
          </section>
        ))}
        <small>
          {fresh
            ? "Live device memory · updates every 2 seconds"
            : connected
              ? (data?.message ?? "Waiting for the GPU")
              : "Connection interrupted. Showing the last sample."}
        </small>
      </div>
    </details>
  );
}
