/**
 * lib/render — scored lead → Astro-factory hand-off artifacts.
 *
 * The bridge in the Astro cutover (docs/operations/ops-astro-cutover-plan.md,
 * Part B): takes the agent's generated ClientConfig and emits exactly what the
 * clients-repo factory needs — the drop-in `client.config.ts` source and the
 * scaffold/deploy command block. Both the board's semi-manual "Render" action
 * and the future human-triggered deploy worker consume this seam; automating
 * later means executing `commands` instead of displaying them.
 *
 * Re-validates through defineClient (the vendored contract) so a config that
 * drifted since generation fails loudly here, not in the clients build.
 */
import { defineClient } from '../schema/index.mjs';

/**
 * Build all hand-off artifacts for one config.
 * @param {unknown} config  the lead's stored ClientConfig (re-validated here)
 * @returns {{ slug: string, preset: string, configFile: string, commands: string }}
 * @throws when the config no longer passes the contract (readable zod issues)
 */
export function renderArtifacts(config) {
  const valid = defineClient(config);
  return {
    slug: valid.slug,
    preset: valid.brand.palettePreset,
    configFile: configFileSource(valid),
    commands: deployCommands(valid),
  };
}

/** The drop-in apps/<slug>/client.config.ts source. @param {object} valid */
function configFileSource(valid) {
  return (
    `import { defineClient } from "@hirobius/schema";\n\n` +
    `export default defineClient(${JSON.stringify(valid, null, 2)});\n`
  );
}

/** The scaffold → preview → prod command block (run in hirobius/clients). @param {object} valid */
function deployCommands(valid) {
  const { slug } = valid;
  const name = JSON.stringify(valid.business.name); // shell-safe double-quoting
  return [
    `# in hirobius/clients`,
    `pnpm new-client ${slug} --name ${name} --preset ${valid.brand.palettePreset}`,
    `# paste the generated config into apps/${slug}/client.config.ts`,
    `# fill form.accessKey (Web3Forms) + swap placeholder photos before prod`,
    `cd apps/${slug} && vercel link && vercel deploy   # preview (basic-auth gated) → mark rendered`,
    `vercel deploy --prod && vercel domains add <domain>   # on "yes" → mark published (billing event)`,
  ].join('\n');
}
