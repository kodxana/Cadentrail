export type PlaybackWindow = {
  epoch: number;
  start: number;
  end: number;
  beat: number;
  horizon: number;
  offset: number;
};
export function wrappedBeat(
  raw: number,
  start: number,
  end: number,
  loop: boolean,
) {
  return loop && raw >= end ? start + ((raw - end) % (end - start)) : raw;
}
/** Audio-clock windows let adjacent loop passes be scheduled before the boundary. */
export function playbackWindows(
  raw: number,
  start: number,
  a: number,
  b: number,
  loop: boolean,
  ahead: number,
): PlaybackWindow[] {
  if (!loop)
    return [
      {
        epoch: 0,
        start,
        end: Infinity,
        beat: raw,
        horizon: raw + ahead,
        offset: 0,
      },
    ];
  const length = b - a;
  if (length < 0.125)
    throw new Error("Loop region must be at least one eighth of a beat");
  const result: PlaybackWindow[] = [];
  let epoch = raw < b ? 0 : 1 + Math.floor((raw - b) / length);
  for (let i = 0; i < 512; i++, epoch++) {
    const offset = epoch ? b - start + (epoch - 1) * length : 0;
    const begin = epoch ? a : start;
    const current = begin + raw - start - offset;
    if (current + ahead < begin) break;
    result.push({
      epoch,
      start: begin,
      end: b,
      beat: Math.max(begin, current),
      horizon: Math.min(b, current + ahead),
      offset,
    });
  }
  return result;
}
