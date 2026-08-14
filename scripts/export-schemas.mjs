// Emit the block catalogue as plain JSON.
//
// The Vendure plugin and the dashboard both need to know what blocks exist and
// what props each takes — the plugin to build the AI contract and validate what
// comes back, the dashboard to build the block inspector. Neither can import an
// ESM module out of this repo at build time, so the catalogue is exported here
// and vendored, with `npm run check:schemas` failing if the vendored copy has
// drifted from the renderer that actually does the rendering.
//
// Run: node scripts/export-schemas.mjs

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RENDERER_VERSION, blockCatalogue, staticWidgetIds, MENU_LOCATIONS, SLOTS, TOKEN_GROUPS } from '../renderer/index.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'block-schemas.json');

const catalogue = {
  rendererVersion: RENDERER_VERSION,
  tokenGroups: TOKEN_GROUPS,
  menuLocations: MENU_LOCATIONS,
  templateSlots: SLOTS,
  staticWidgets: staticWidgetIds(),
  blocks: blockCatalogue(),
};

writeFileSync(OUT, JSON.stringify(catalogue, null, 2) + '\n');
console.log(`Exported ${catalogue.blocks.length} block schemas -> renderer/block-schemas.json`);
