/* Cuando mejora la base de especies, las plantas ya guardadas se ponen al día. */

/** Recalcula los cuidados guardados de cada especie y la base de riego de las plantas en modo automático. */
export function refreshCare(data, lookup) {
  let changed = 0;
  const plants = data.plants.map((p) => {
    if (!p.sci) return p;
    const old = data.species[p.sci];
    const ai = old?.care?.source === 'IA';
    const care = ai ? old.care : lookup(p.sci, p.genus, p.family);
    if (old && !ai) data.species[p.sci] = { ...old, names: care.names, care };
    if (p.auto && care.days && p.baseDays !== care.days) {
      changed++;
      return { ...p, baseDays: care.days };
    }
    return p;
  });
  for (const [sci, sp] of Object.entries(data.species)) {
    if (plants.some((p) => p.sci === sci) || sp.care?.source === 'IA') continue;
    const care = lookup(sci, '', '');
    if (care.source !== 'genérico') data.species[sci] = { ...sp, names: care.names, care };
  }
  return { plants, changed };
}
