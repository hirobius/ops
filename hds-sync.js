import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';

const { FIGMA_PAT, FIGMA_FILE_KEY } = process.env;

// --- DEBUG: Verify Environment ---
if (!FIGMA_PAT || !FIGMA_FILE_KEY) {
  console.error("❌ ERROR: Missing FIGMA_PAT or FIGMA_FILE_KEY in .env file.");
  process.exit(1);
}
console.log(`🔑 Token Loaded: ${FIGMA_PAT.substring(0, 6)}... (Length: ${FIGMA_PAT.length})`);
console.log(`📄 File Key: ${FIGMA_FILE_KEY}`);

const figmaApi = axios.create({
  baseURL: 'https://api.figma.com/v1',
  headers: { 
    'X-Figma-Token': FIGMA_PAT.trim(), // Trim added to remove accidental spaces
    'Content-Type': 'application/json'
  }
});

async function sync() {
  try {
    const manifest = JSON.parse(fs.readFileSync('./public/hds-manifest.json', 'utf8'));
    
    const colors = Object.entries(manifest.tokens.primitive).map(([name, data]) => {
      const hex = typeof data === 'string' ? data : data.value;
      if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null;

      return {
        name: `primitive/${name}`,
        rgb: {
          r: parseInt(hex.slice(1, 3), 16) / 255,
          g: parseInt(hex.slice(3, 5), 16) / 255,
          b: parseInt(hex.slice(5, 7), 16) / 255
        }
      };
    }).filter(Boolean);

    console.log(`🚀 Found ${colors.length} hex colors. Attempting sync...`);

    const payload = {
      variableCollections: [{ action: 'CREATE', name: 'HDS System', initialModeId: 'Mode1' }],
      variables: colors.map(c => ({ action: 'CREATE', name: c.name, resolvedType: 'COLOR' })),
      variableValues: colors.map(c => ({
        action: 'SET',
        variableName: c.name,
        modeName: 'Mode1',
        value: { r: c.rgb.r, g: c.rgb.g, b: c.rgb.b }
      }))
    };

    const response = await figmaApi.post(`/files/${FIGMA_FILE_KEY}/variables`, payload);
    console.log("✅ SUCCESS: HDS Tokens are now in Figma!");
    
  } catch (err) {
    console.error("❌ Sync Failed:");
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
  }
}

sync();
