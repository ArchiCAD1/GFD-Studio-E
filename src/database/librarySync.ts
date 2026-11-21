/** Libraries that don't fit a table — title blocks, components, feeder
 * presets, SLD notes, price lists saved from the BOQ, design references, building presets, CAD layer templates, your schedule formats, layout templates, page setups — are kept in
 * GFD Studio E Database/Library.json beside the workbooks, so they sync through Google
 * Drive to every computer. This computer keeps a working copy. */

export const LIBRARY_KEYS = ['gfde.titleTemplates', 'gfde.components', 'gfde.feederPresets', 'gfde.sldNotes', 'gfde.priceLists', 'gfde.boqMakeLists', 'gfde.sheetTemplates', 'gfde.assemblies', 'gfde.enclosureCatalogues', 'gfde.deviceDims', 'gfde.designReferences', 'gfde.buildingPresets', 'gfde.cadLayerTemplates', 'gfde.scheduleFormats', 'gfde.layoutTemplates', 'gfde.pageSetups', 'gfde.lightningRiskPresets', 'gfde.specTemplates'] as const;

const bridge = () => (typeof window !== 'undefined' ? window.gfde?.database : undefined);

/** Reads Library.json into this computer's copy (the file wins); first run
 * on a computer: what's here is written to the file. */
export async function pullLibrary(): Promise<number> {
  const db = bridge();
  if (!db?.readLibrary) return 0;
  const data = (await db.readLibrary()) as Record<string, unknown>;
  let n = 0;
  for (const k of LIBRARY_KEYS) {
    const value = data[k] === undefined ? data[k.replace(/^gfde\./, 'lvds.')] : data[k];
    if (value === undefined) continue;
    try { localStorage.setItem(k, JSON.stringify(value)); n++; } catch { /* storage blocked */ }
  }
  if (!Object.keys(data).length) await pushLibrary();
  return n;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Writes this computer's libraries to Library.json (debounced). */
export function pushLibrary(): Promise<void> {
  const db = bridge();
  if (!db?.writeLibrary) return Promise.resolve();
  clearTimeout(timer);
  return new Promise((resolve) => {
    timer = setTimeout(async () => {
      const data: Record<string, unknown> = {};
      for (const k of LIBRARY_KEYS) {
        try { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); } catch { /* skip */ }
      }
      try { await db.writeLibrary(data); } catch { /* folder not available */ }
      resolve();
    }, 400);
  });
}
