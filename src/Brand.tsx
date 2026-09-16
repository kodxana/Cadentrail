export const BRAND = "Cadentrail";
export const TAGLINE = "A DAW for YuE2";
export const CREDIT = "Created by Madiator2011 · Built for Runpod";

export function BrandMark({ size = 25 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M25 7a13 13 0 1 0 0 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M10 16h3l2-6 4 12 2-6h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function BrandCredits() {
  return <div className="brand-credits">
    <strong>{CREDIT}</strong>
    <span>Independent software. Music powered by <a href="https://huggingface.co/m-a-p/YuE2-3B" target="_blank" rel="noreferrer">YuE2 by m-a-p</a>.</span>
    <span>Not an official YuE2 or Runpod product.</span>
  </div>;
}
