import { useEffect, useRef, useState, type RefObject } from "react";
export function useSize<T extends HTMLElement>(): [
  RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null),
    [size, setSize] = useState({ width: 800, height: 400 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const dpr = window.devicePixelRatio || 1;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}
export const rounded = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 3,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0.1, w), h, r);
  ctx.fill();
};
