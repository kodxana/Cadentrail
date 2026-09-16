export type StorageInfo = {
  usedBytes: number; capacityBytes: number | null; availableBytes: number | null;
  source: "configured" | "filesystem" | "unknown"; complete: boolean; measuredAt: number;
};
export function storageSize(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;
}
export function StorageStatus({ value }: { value: unknown }) {
  const storage=value as StorageInfo | undefined;
  if (!storage) return <span>Checking storage…</span>;
  const used=`${storage.complete ? "" : "At least "}${storageSize(storage.usedBytes)}`;
  const title=storage.source === "configured"
    ? `Workspace files within the configured Pod allocation. ${storage.availableBytes === null ? "Some files could not be measured." : storageSize(storage.availableBytes)+" available."} Checked ${new Date(storage.measuredAt*1000).toLocaleTimeString()}.`
    : storage.source === "unknown" ? "Workspace files measured. This host does not report the Pod's allocation; shared-host free space is not shown."
    : "Space used by workstation files; available space is on this local disk.";
  return <span title={title}>{storage.capacityBytes !== null
    ? `${used} / ${storageSize(storage.capacityBytes)} used`
    : `${used} used · ${storage.availableBytes === null ? "allocation unavailable" : storageSize(storage.availableBytes)+" disk free"}`}</span>;
}
