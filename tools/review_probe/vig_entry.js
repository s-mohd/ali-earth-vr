import { buildVignettes } from '../../src/world/vignettes.js';
const list = buildVignettes();
const geos = new Set(), texs = new Set(); let verts = 0, tris = 0, bytes = 0;
for (const v of list) v.group.traverse((o) => {
  if (o.geometry && !geos.has(o.geometry)) {
    geos.add(o.geometry); const g = o.geometry; verts += g.attributes.position.count; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const a of Object.values(g.attributes)) bytes += a.array.byteLength; if (g.index) bytes += g.index.array.byteLength;
  }
  for (const m of [].concat(o.material || [])) for (const k of Object.keys(m)) if (m[k]?.isTexture) texs.add(m[k]);
});
window.__vig = { vignettes: list.length, geometries: geos.size, verts, tris: Math.round(tris), MB: +(bytes / 1048576).toFixed(2), textures: texs.size };
