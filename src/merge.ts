/** Three-way project merge: append worker results without dropping local edits. */
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function mergeChanges(
  base: any,
  local: any,
  remote: any,
  path = "project",
  resolve?: (path: string, base: any, local: any, remote: any) => any,
): any {
  if (equal(local, remote) || equal(base, remote)) return local;
  if (equal(base, local)) return remote;
  if (object(base) && object(local) && object(remote)) {
    const result: Record<string, unknown> = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      if (key === "revision" || key === "updatedAt") {
        result[key] = remote[key];
        continue;
      }
      result[key] = mergeChanges(
        base[key],
        local[key],
        remote[key],
        path + "." + key,
        resolve,
      );
    }
    return result;
  }
  if (
    Array.isArray(base) &&
    Array.isArray(local) &&
    Array.isArray(remote) &&
    [...base, ...local, ...remote].every(
      (v) => object(v) && typeof v.id === "string",
    )
  ) {
    const b = new Map(base.map((v) => [v.id, v])),
      l = new Map(local.map((v) => [v.id, v])),
      r = new Map(remote.map((v) => [v.id, v]));
    const common = base
      .filter((v) => l.has(v.id) && r.has(v.id))
      .map((v) => v.id);
    const commonIds = new Set(common);
    const localOrder = local.map((v) => v.id).filter((id) => commonIds.has(id));
    const remoteOrder = remote
      .map((v) => v.id)
      .filter((id) => commonIds.has(id));
    const localMoved = !equal(common, localOrder),
      remoteMoved = !equal(common, remoteOrder);
    let preferRemoteOrder = remoteMoved && !localMoved;
    if (localMoved && remoteMoved && !equal(localOrder, remoteOrder) && resolve) {
      preferRemoteOrder = equal(resolve(path + ".order", common, localOrder, remoteOrder), remoteOrder);
    } else if (localMoved && remoteMoved && !equal(localOrder, remoteOrder))
      throw new Error(
        "Concurrent edits to " +
          path +
          " order. Your local arrangement is retained.",
      );
    const primary = preferRemoteOrder ? remote : local,
      secondary = primary === remote ? local : remote;
    const chosen = new Set(primary.map((v) => v.id));
    const order = [
      ...primary.map((v) => v.id),
      ...secondary.filter((v) => !chosen.has(v.id)).map((v) => v.id),
    ];
    return order
      .map((id) =>
        mergeChanges(b.get(id), l.get(id), r.get(id), path + "." + id, resolve),
      )
      .filter((v) => v !== undefined);
  }
  if (resolve) return resolve(path, base, local, remote);
  throw new Error(
    `Concurrent edits to ${path.replace("project.", "")}. Your local edits are retained; save a recovery copy before reopening.`,
  );
}
