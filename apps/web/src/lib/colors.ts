/**
 * Deterministic, stable hue for a label string so the same option value
 * always gets the same pill color across renders / sessions.
 */
export function optionHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) % 360;
  }
  // Keep hues away from muddy range: map to pleasant bands.
  return h;
}

export function pillStyle(text: string): React.CSSProperties {
  return { ['--hue' as string]: optionHue(text) } as React.CSSProperties;
}
