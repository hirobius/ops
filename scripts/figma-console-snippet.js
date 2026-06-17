/** @internal — not part of @hirobius/design-system public API surface. */
const HDS_DATA = {
  "neutral-50": "#fafafa",
  "neutral-100": "#f5f5f5",
  "neutral-200": "#e5e5e5",
  "neutral-300": "#d4d4d4",
  "neutral-400": "#a3a3a3",
  "neutral-500": "#737373",
  "neutral-600": "#525252",
  "neutral-700": "#404040",
  "neutral-800": "#262626",
  "neutral-850": "#1a1a1a",
  "neutral-900": "#111111",
  "neutral-950": "#0a0a0a",
  "neutral-white": "#ffffff",
  "neutral-black": "#000000",
  "blue-50": "oklch(0.96 0.03 266.54)",
  "blue-100": "oklch(0.92 0.04 266.54)",
  "blue-200": "oklch(0.88 0.07 266.54)",
  "blue-300": "oklch(0.70 0.2903 266.54)",
  "blue-400": "oklch(0.65 0.2903 266.54)",
  "blue-450": "oklch(0.56 0.29 266.60)",
  "blue-500": "#1E2EFD",
  "blue-600": "oklch(0.45 0.2903 266.54)",
  "blue-700": "oklch(0.44 0.2903 266.54)",
  "blue-800": "oklch(0.30 0.07 266.54)",
  "blue-900": "oklch(0.22 0.05 266.54)",
  "red-50": "#fef2f2",
  "red-400": "#f87171",
  "red-700": "#b91c1c",
  "red-950": "#450a0a",
  "green-50": "#ecfdf5",
  "green-400": "#34d399",
  "green-700": "#047857",
  "green-950": "#022c22",
  "amber-50": "#fffbeb",
  "amber-400": "#fbbf24",
  "amber-800": "#92400e",
  "amber-950": "#451a03",
  "microsoftGameDev-100": "#E5E5FC",
  "microsoftGameDev-500": "#6d31fb",
  "microsoftGameDev-900": "oklch(0.22 0.16 304)"
};

(async () => {
  try {
    console.log("🚀 Initializing Full Spectrum Sync...");
    
    // --- OKLCH to sRGB Converter ---
    const parseOklch = (str) => {
      const match = str.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/);
      if (!match) return null;
      const [_, l, c, h] = match.map(Number);
      
      const a = c * Math.cos(h * Math.PI / 180);
      const b = c * Math.sin(h * Math.PI / 180);
      const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
      const l_3 = l_ * l_ * l_;
      const m_3 = m_ * m_ * m_;
      const s_3 = s_ * s_ * s_;
      const r = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
      const g = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
      const b_val = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;
      
      const f = (x) => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1/2.4) - 0.055;
      return { r: Math.max(0, Math.min(1, f(r))), g: Math.max(0, Math.min(1, f(g))), b: Math.max(0, Math.min(1, f(b_val))) };
    };

    const hexToRgb = (hex) => ({
      r: parseInt(hex.slice(1, 3), 16) / 255,
      g: parseInt(hex.slice(3, 5), 16) / 255,
      b: parseInt(hex.slice(5, 7), 16) / 255
    });

    const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = existingCollections.find(c => c.name === "HDS Primitive");
    if (!collection) collection = figma.variables.createVariableCollection("HDS Primitive");
    const modeId = collection.modes[0].modeId;
    const variablesInCollection = await figma.variables.getLocalVariablesAsync();

    for (const [name, value] of Object.entries(HDS_DATA)) {
      let rgb;
      if (value.startsWith('#')) rgb = hexToRgb(value);
      else if (value.startsWith('oklch')) rgb = parseOklch(value);
      
      if (!rgb) continue;

      let variable = variablesInCollection.find(v => v.name === name && v.variableCollectionId === collection.id);
      if (!variable) variable = figma.variables.createVariable(name, collection.id, "COLOR");
      
      variable.setValueForMode(modeId, rgb);
      console.log(`✅ Synced: ${name}`);
    }

    console.log("✨ All colors (Hex + OKLCH) are live!");
  } catch (e) {
    console.error("❌ Figma Script Error:", e.message);
  }
})();
