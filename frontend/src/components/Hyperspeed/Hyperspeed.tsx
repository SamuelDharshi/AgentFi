"use client";

export interface HyperspeedEffectOptions {
  disabled?: boolean;
}

type HyperspeedProps = {
  effectOptions?: HyperspeedEffectOptions;
};

export default function Hyperspeed({ effectOptions }: HyperspeedProps) {
  if (effectOptions?.disabled) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.12),transparent_42%),linear-gradient(180deg,rgba(5,5,5,0.85),rgba(5,5,5,0.96))]"
    />
  );
}
