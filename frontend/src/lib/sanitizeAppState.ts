const PERSISTENT_KEYS: readonly string[] = [
  "viewBackgroundColor",
  "gridSize",
  "theme",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
  "currentItemLinearStrokeSharpness",
  "currentItemRoundness",
  "exportBackground",
  "exportWithDarkMode",
  "exportEmbedScene",
  "exportScale",
  "name",
  "scrollX",
  "scrollY",
  "zoom",
];

export function sanitizeAppState(
  appState: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!appState) return {};
  const out: Record<string, unknown> = {};
  for (const key of PERSISTENT_KEYS) {
    if (key in appState) out[key] = appState[key];
  }
  return out;
}
