// Persisted preset keys and synthesis work remain compatible with older projects.
export const renderSteps = {
  fast: 16,
  balanced: 32,
  high: 48,
  maximum: 64,
} as const;
export const renderLabels = {
  fast: "Fast",
  balanced: "Standard",
  high: "Extended",
  maximum: "Maximum effort",
  custom: "Custom Studio settings",
} as const;
export function renderPresetKey(
  key: string,
  steps: number,
): keyof typeof renderLabels {
  return Object.hasOwn(renderSteps, key) &&
    renderSteps[key as keyof typeof renderSteps] === steps
    ? (key as keyof typeof renderSteps)
    : "custom";
}
export function renderPresetLabel(key: string): string {
  return Object.hasOwn(renderLabels, key)
    ? renderLabels[key as keyof typeof renderLabels]
    : renderLabels.custom;
}
export function generationLimit(value: unknown): string | null {
  if (value === true)
    return "The ending may be incomplete. Listen before exporting.";
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const flags = value as Record<string, unknown>;
  if (flags.semantic === true)
    return flags.abc === true
      ? "The score plan and ending may be incomplete. Review them before another take."
      : "The ending may be incomplete. Listen before exporting.";
  return flags.abc === true
    ? "The score plan may be incomplete. Review the score or simplify the lyrics before another take."
    : null;
}
export const revisionExplanation =
  "A revised take is a new recording of the whole song. Vocals and other parts may change. Your original take stays saved.";
export const renderingExplanation =
  "Standard is recommended. More processing takes longer, without guaranteeing better music or clearer lyrics.";
export const languageExplanation =
  "Guides the written lyrics and singing request. The sung language and pronunciation are not verified.";
export function vocalExplanation(role: string): string {
  if (role === "duet" || role === "dialogue" || role === "shared")
    return "Requests distinct or alternating voices. Singer identity and who sings each line can vary.";
  if (role === "instrumental")
    return "Requests music without singing. Occasional vocal sounds may still occur.";
  return "Guides the vocal sound; the result can vary between takes.";
}

export function instrumentalDirection(g: {
  role: string;
  style: string;
}): boolean {
  if (g.role !== "auto") return g.role === "instrumental";
  if (/\b(no vocals?|without (singing|vocals?)|no singing)\b/i.test(g.style))
    return true;
  if (/\b(vocals?|singer|singing|choir|choral|opera|duet)\b/i.test(g.style))
    return false;
  if (/\bnot[ -]instrumental\b/i.test(g.style)) return false;
  const wholeSong = g.style.replace(
    /\binstrumental\s+(?:intro|outro|bridge|break|breakdown|solo|section)s?\b/gi,
    "",
  );
  if (/\binstrumental\b/i.test(wholeSong)) return true;
  return /\b(classical|orchestral|symphony|concerto|sonata|chamber music)\b/i.test(
    g.style,
  );
}
