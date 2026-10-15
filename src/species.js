// Base offline de especies. Valores de referencia para una planta de interior
// a ~22 °C; después se ajustan por clima y lugar (ver logic.js).
//
//  d: días entre riegos | l: luz ideal (1 poca, 2 brillante indirecta, 3 mucha, 4 sol directo)
//  m: temperatura mínima que tolera (°C) | h: humedad ideal | o: 1 si vive bien afuera en clima templado

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const PLACEMENTS = [
  { id: 'interior-poca', label: 'Interior, poca luz', icon: '🛋️', light: 1, outdoor: false, dry: 1.25 },
  { id: 'interior-luz', label: 'Interior luminoso (ventana)', icon: '🪟', light: 2.5, outdoor: false, dry: 1 },
  { id: 'balcon', label: 'Balcón o patio techado', icon: '🌤️', light: 3.5, outdoor: true, dry: 0.85 },
  { id: 'jardin', label: 'Afuera, a pleno sol', icon: '☀️', light: 4, outdoor: true, dry: 0.75 },
];

export const placementOf = (id) => PLACEMENTS.find((p) => p.id === id) || PLACEMENTS[1];

const E = (k, n, d, l, m, h, o, ...t) => ({ k: [].concat(k), n, d, l, m, h, o, t });

const DB = [
  E('monstera deliciosa', ['Monstera', 'Costilla de Adán'], 8, 2, 12, 'media', 1,
    'Luz brillante sin sol fuerte directo.', 'Regá cuando los 3-4 cm superiores del sustrato estén secos.'),
  E('epipremnum aureum', ['Poto', 'Pothos'], 7, 1.5, 12, 'media', 0,
    'Aguanta poca luz, pero crece mejor con luz indirecta.', 'Si las hojas amarillean, estás regando de más.'),
  E(['dracaena trifasciata', 'sansevieria'], ['Lengua de suegra', 'Espada de San Jorge', 'Sansevieria'], 18, 2, 8, 'baja', 1,
    'Casi indestructible: lo que más la mata es el exceso de agua.', 'En invierno regá una vez al mes o menos.'),
  E('zamioculcas zamiifolia', ['Zamioculca', 'Planta ZZ'], 18, 1.5, 10, 'baja', 0,
    'Guarda agua en sus rizomas: mejor quedarse corto que pasarse.', 'Tolera poca luz.'),
  E('chlorophytum comosum', ['Cinta', 'Mala madre'], 6, 2, 5, 'media', 1,
    'Las puntas marrones suelen indicar sales del agua o aire seco.', 'Produce hijuelos que se pueden replantar.'),
  E(['spathiphyllum'], ['Cuna de Moisés', 'Espatifilo'], 5, 1.5, 12, 'alta', 0,
    'Avisa cuando tiene sed: las hojas se caen. Regá y se recupera.', 'Prefiere sombra luminosa; el sol directo quema las hojas.'),
  E('ficus elastica', ['Gomero', 'Ficus de hoja de goma'], 9, 3, 10, 'media', 0,
    'Limpiá las hojas con un paño húmedo.', 'No la muevas seguido: tira hojas con los cambios.'),
  E('ficus lyrata', ['Ficus lira', 'Higuera de hoja de violín'], 8, 3, 12, 'media', 0,
    'Necesita mucha luz y no tolera corrientes de aire.', 'Girala de a poco para que crezca derecha.'),
  E('ficus benjamina', ['Ficus', 'Ficus benjamina'], 7, 3, 10, 'media', 0,
    'Se ofende con los cambios de lugar y de luz: tira hojas.', 'Evitá corrientes de aire y calefactores cerca.'),
  E('aloe vera', ['Aloe', 'Aloe vera', 'Sábila'], 16, 4, 3, 'baja', 1,
    'Sol directo o mucha luz. Dejá secar el sustrato por completo.', 'Maceta con buen drenaje.'),
  E('echeveria', ['Echeveria', 'Rosa de piedra'], 14, 4, 5, 'baja', 1,
    'Necesita sol; con poca luz se estira.', 'Regá sobre el sustrato, no sobre la roseta.'),
  E('crassula ovata', ['Árbol de jade', 'Planta de jade'], 14, 3.5, 5, 'baja', 1,
    'Hojas arrugadas = sed; hojas blandas y caídas = exceso de agua.', 'Mucha luz.'),
  E('haworthia', ['Haworthia'], 16, 2.5, 8, 'baja', 0,
    'Luz brillante pero sin sol fuerte directo.', 'Regá poco: es muy sensible a la pudrición.'),
  E('opuntia', ['Tuna', 'Nopal'], 21, 4, -10, 'baja', 1,
    'Aguanta heladas y sequía. Sol pleno.', 'En invierno casi no necesita agua.'),
  E('aspidistra elatior', ['Aspidistra'], 8, 1, 3, 'media', 1,
    'Ideal para rincones oscuros.', 'Hoja quemada = demasiado sol.'),
  E('dracaena marginata', ['Dracena', 'Dracaena marginata'], 10, 2.5, 10, 'media', 0,
    'Es sensible al flúor del agua: si las puntas se secan, usá agua reposada.'),
  E('dracaena fragrans', ['Tronco del Brasil'], 8, 2, 10, 'media', 0,
    'Luz brillante indirecta.', 'Las puntas secas suelen ser por aire seco o agua con mucho cloro.'),
  E('philodendron', ['Filodendro', 'Filodendro corazón'], 7, 2, 12, 'media', 0,
    'Luz indirecta; el sol directo le quema las hojas.', 'Se puede guiar con un tutor.'),
  E('anthurium', ['Anturio', 'Anthurium'], 6, 2, 15, 'alta', 0,
    'Le gusta la humedad y el calor constante.', 'Regá con agua a temperatura ambiente.'),
  E('calathea', ['Calathea'], 5, 1.5, 15, 'alta', 0,
    'Prefiere agua reposada o de lluvia: se le arruga y se quema la hoja con el cloro.', 'Sustrato apenas húmedo, nunca encharcado.'),
  E('maranta', ['Maranta', 'Planta de la oración'], 5, 1.5, 15, 'alta', 0,
    'Mantené el sustrato apenas húmedo.', 'Evitá el sol directo.'),
  E('nephrolepis', ['Helecho de Boston', 'Helecho'], 4, 2, 10, 'alta', 0,
    'No dejes secar el sustrato.', 'Rociá las hojas seguido.'),
  E('phalaenopsis', ['Orquídea mariposa', 'Orquídea'], 7, 2, 12, 'media', 0,
    'Regá sumergiendo la maceta 10 minutos y escurriendo bien.', 'No dejes agua en el plato.'),
  E('hedera helix', ['Hiedra'], 6, 2, -15, 'media', 1,
    'Muy resistente al frío.', 'Podala para que se ramifique.'),
  E('pilea peperomioides', ['Planta china del dinero', 'Pilea'], 8, 2.5, 10, 'media', 0,
    'Girala cada tanto para que crezca pareja.', 'Separá los hijuelos para regalar.'),
  E('peperomia', ['Peperomia'], 10, 2, 12, 'media', 0,
    'Hojas carnosas: guarda agua, regá poco.'),
  E('begonia', ['Begonia'], 6, 2.5, 10, 'media', 1,
    'Regá el sustrato, no las hojas: se llenan de hongos.', 'Luz brillante sin sol directo.'),
  E('hibiscus rosa-sinensis', ['Hibisco', 'Rosa de China'], 3, 4, 8, 'media', 1,
    'Necesita sol y riego frecuente en verano.', 'Se protege de heladas.'),
  E('pelargonium', ['Geranio', 'Malvón'], 5, 4, 2, 'baja', 1,
    'Mucho sol. Sacá las flores marchitas.', 'No mojar las hojas.'),
  E('lavandula', ['Lavanda'], 7, 4, -10, 'baja', 1,
    'Sol pleno y suelo que drene bien.', 'Podala después de la floración.'),
  E(['rosmarinus officinalis', 'salvia rosmarinus'], ['Romero'], 8, 4, -8, 'baja', 1,
    'Sol pleno. Prefiere quedarse seco que encharcado.'),
  E('ocimum basilicum', ['Albahaca'], 2, 4, 10, 'media', 1,
    'Pellizcá las flores para que siga dando hojas.', 'No resiste el frío: es de verano.'),
  E('mentha', ['Menta'], 3, 3, -10, 'media', 1,
    'Mantené el sustrato húmedo.', 'Es invasiva: mejor en maceta propia.'),
  E('petroselinum crispum', ['Perejil'], 3, 3, -5, 'media', 1,
    'Sustrato húmedo, sin encharcar.'),
  E('rosa', ['Rosa', 'Rosal'], 4, 4, -15, 'media', 1,
    'Mucho sol y riego profundo en la base.', 'Evitá mojar las hojas para prevenir hongos.'),
  E('jasminum', ['Jazmín'], 4, 3.5, 0, 'media', 1,
    'Sol o semisombra. Riego regular en primavera y verano.'),
  E('citrus', ['Limonero', 'Cítrico'], 5, 4, -2, 'media', 1,
    'Mucho sol y riego profundo; que drene bien.', 'Protegé los ejemplares chicos de las heladas.'),
  E('plectranthus scutellarioides', ['Coleo'], 4, 3, 8, 'media', 1,
    'Pellizcá las puntas para que quede tupido.'),
  E('tradescantia', ['Tradescantia', 'Zebrina', 'Misionera'], 5, 2.5, 5, 'media', 1,
    'Podala seguido: se ramifica y queda más tupida.'),
  E('aglaonema', ['Aglaonema'], 9, 1.5, 12, 'media', 0,
    'Una de las más fáciles para poca luz.'),
  E('dieffenbachia', ['Dieffenbachia', 'Difenbaquia'], 7, 2, 12, 'media', 0,
    'Su savia es irritante: usá guantes al podar.'),
  E('yucca', ['Yuca'], 14, 3.5, 0, 'baja', 1,
    'Mucha luz; resiste sequía.', 'Regá poco.'),
  E(['heptapleurum', 'schefflera'], ['Cheflera', 'Schefflera'], 7, 2.5, 8, 'media', 0,
    'Luz brillante; tira hojas si se la mueve o si se riega de más.'),
  E('beaucarnea recurvata', ['Pata de elefante'], 18, 3, 5, 'baja', 0,
    'Guarda agua en la base del tronco: regá poco.'),
  E('kalanchoe', ['Kalanchoe'], 12, 3.5, 8, 'baja', 1,
    'Luz brillante. Para que vuelva a florecer necesita noches largas.'),
  E('sedum', ['Sedum'], 14, 4, -15, 'baja', 1,
    'Sol pleno y poca agua.'),
  E('tillandsia', ['Clavel del aire', 'Tillandsia'], 4, 2.5, 8, 'media', 0,
    'No va en tierra: sumergila 20 minutos y secala bien boca abajo.'),
  E('strelitzia', ['Ave del paraíso', 'Strelitzia'], 6, 3.5, 2, 'media', 1,
    'Mucha luz para florecer.'),
  E('alocasia', ['Alocasia', 'Oreja de elefante'], 6, 2.5, 15, 'alta', 0,
    'Es exigente: humedad alta, sin corrientes ni sol directo.', 'En invierno puede perder hojas y rebrotar.'),
  E('fittonia', ['Fitonia'], 3, 1.5, 12, 'alta', 0,
    'Se desmaya cuando tiene sed y se recupera al regar.'),
  E('gardenia', ['Gardenia'], 4, 3, 8, 'alta', 1,
    'Prefiere agua sin cal y suelo ácido.', 'No le gusta que la muevan con botones formados.'),
  E('petunia', ['Petunia'], 2, 4, 2, 'media', 1,
    'Sol pleno y riego frecuente en maceta.'),
  E('schlumbergera', ['Cactus de Navidad', 'Flor de mayo'], 7, 2.5, 8, 'media', 0,
    'No es un cactus de desierto: le gusta algo de humedad.', 'No la muevas cuando tiene botones.'),
  E('hoya', ['Hoya', 'Flor de cera'], 12, 2.5, 10, 'media', 0,
    'No cortes los pedúnculos secos: vuelve a florecer en el mismo lugar.'),
  E('chamaedorea elegans', ['Palmera de salón', 'Palmera chamaedorea'], 7, 1.5, 10, 'media', 0,
    'Tolera poca luz.'),
  E('howea', ['Kentia'], 8, 2, 8, 'media', 0,
    'Crece lento y vive muchos años.'),
  E('dypsis lutescens', ['Palmera areca', 'Areca'], 5, 3, 10, 'media', 0,
    'Mucha luz sin sol directo.', 'Sensible a sales del agua: usá agua reposada.'),
  E('syngonium', ['Singonio', 'Syngonium'], 6, 2, 12, 'media', 0,
    'Se hace trepadora con los años: guiala.'),
  E('rhipsalis', ['Rhipsalis'], 10, 2, 10, 'media', 0,
    'Cactus de selva: sustrato aireado y luz indirecta.'),
  E('oxalis', ['Trébol morado', 'Oxalis'], 5, 3, 5, 'media', 1,
    'Se duerme en invierno: regá menos y no la des por muerta.'),
  E('ceropegia woodii', ['Corazón enredado'], 14, 2.5, 10, 'baja', 0,
    'Colgante; hojas arrugadas son señal de sed.'),
  E('senecio rowleyanus', ['Collar de perlas'], 14, 3, 8, 'baja', 0,
    'Muy sensible al exceso de agua. Mucha luz.'),
  E('agave', ['Agave', 'Pita'], 21, 4, -5, 'baja', 1,
    'Sol pleno; suelo que drene muy bien.'),
  E('cycas revoluta', ['Cica'], 12, 3.5, -5, 'baja', 1,
    'Crece muy lento. No la riegues en exceso.'),
  E('bougainvillea', ['Bugambilia', 'Santa Rita'], 5, 4, 0, 'baja', 1,
    'Más sol y menos agua = más flores.'),
];

// Si no hay datos de la especie ni del género, se usa lo típico de la familia.
const FAMILIES = {
  cactaceae: [21, 4, 5, 'baja', 1, 'Cactus: sol, poca agua y buen drenaje.'],
  crassulaceae: [14, 3.5, 5, 'baja', 1, 'Suculenta: dejá secar el sustrato entre riegos.'],
  asphodelaceae: [16, 3, 5, 'baja', 1, 'Suculenta: dejá secar bien entre riegos.'],
  araceae: [7, 2, 12, 'media', 0, 'Las aráceas prefieren luz indirecta y sustrato apenas húmedo.'],
  orchidaceae: [7, 2, 12, 'media', 0, 'Las orquídeas necesitan buen drenaje y no toleran el agua estancada.'],
  arecaceae: [7, 2.5, 8, 'media', 0, 'Las palmeras prefieren luz brillante y riego regular.'],
  marantaceae: [5, 1.5, 15, 'alta', 0, 'Humedad alta y sin sol directo.'],
  nephrolepidaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  polypodiaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  pteridaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  aspleniaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  davalliaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  blechnaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  dryopteridaceae: [4, 2, 10, 'alta', 0, 'Los helechos piden humedad constante.'],
  lamiaceae: [4, 4, -5, 'baja', 1, 'Aromáticas: sol y suelo que drene.'],
  moraceae: [8, 3, 10, 'media', 0, 'Los ficus prefieren luz brillante y no soportan los cambios de lugar.'],
  euphorbiaceae: [12, 3, 8, 'baja', 0, 'Dejá secar el sustrato entre riegos.'],
  apocynaceae: [12, 2.5, 10, 'baja', 0, 'Suele aguantar bien la sequedad.'],
  rosaceae: [4, 4, -10, 'media', 1, 'Mucho sol y riego regular.'],
  asparagaceae: [12, 2.5, 5, 'baja', 0, 'Suele guardar agua: regá poco.'],
  commelinaceae: [5, 2.5, 5, 'media', 1, 'Luz brillante y podas para mantenerla tupida.'],
  begoniaceae: [6, 2.5, 10, 'media', 1, 'No mojes las hojas.'],
  gesneriaceae: [6, 2.5, 12, 'alta', 0, 'Luz indirecta y humedad; evitá mojar las hojas.'],
  bromeliaceae: [7, 2.5, 10, 'alta', 0, 'Mantené agua en el centro de la roseta y sustrato apenas húmedo.'],
  geraniaceae: [5, 4, 2, 'baja', 1, 'Sol pleno; dejá secar un poco entre riegos.'],
  rutaceae: [5, 4, -2, 'media', 1, 'Mucho sol y buen drenaje.'],
  myrtaceae: [5, 4, -2, 'media', 1, 'Mucho sol y riego regular.'],
  oleaceae: [5, 3.5, 0, 'media', 1, 'Sol o semisombra y riego regular.'],
  malvaceae: [4, 4, 8, 'media', 1, 'Mucho sol y riego frecuente en verano.'],
};

const GENERIC = {
  d: 7, l: 2, m: 10, h: 'media', o: 0,
  t: ['Dejá secar un poco la capa superior del sustrato antes de volver a regar.'],
};

function toCare(e, source, entry) {
  return {
    sci: entry || '',
    names: e.n || [],
    days: e.d,
    light: e.l,
    minTemp: e.m,
    humidity: e.h,
    outdoorOk: !!e.o,
    tips: e.t || [],
    source,
    generic: source === 'genérico',
  };
}

/** Busca los cuidados de una especie: especie → género → familia → genérico. */
export function lookup(sci, genus = '', family = '') {
  const full = norm(sci);
  const g = norm(genus) || full.split(' ')[0];
  const fam = norm(family);

  let hit = DB.find((e) => e.k.includes(full));
  if (hit) return toCare(hit, 'especie', sci);
  hit = DB.find((e) => e.k.includes(g));
  if (hit) return { ...toCare(hit, 'género', sci), names: [] };

  const f = FAMILIES[fam];
  if (f) {
    return {
      ...toCare({ d: f[0], l: f[1], m: f[2], h: f[3], o: f[4], t: [f[5]], n: [] }, 'familia', sci),
    };
  }
  return { ...toCare({ ...GENERIC, n: [] }, 'genérico', sci) };
}

/** Búsqueda offline por nombre común o científico. */
export function searchSpecies(q) {
  const n = norm(q);
  if (!n) return [];
  const out = [];
  for (const e of DB) {
    const names = [...e.n, ...e.k];
    const score = names.some((x) => norm(x) === n) ? 2 : names.some((x) => norm(x).includes(n)) ? 1 : 0;
    if (score) out.push({ score, sci: e.k[0], names: e.n });
  }
  return out.sort((a, b) => b.score - a.score).map(({ sci, names }) => ({ sci, names }));
}

/** Todos los nombres para autocompletar. */
export function allNames() {
  return DB.flatMap((e) => e.n);
}

export function lightLabel(l) {
  if (l <= 1.5) return 'Tolera poca luz';
  if (l <= 2.5) return 'Luz brillante, sin sol directo';
  if (l <= 3.5) return 'Mucha luz, algo de sol';
  return 'Sol directo';
}

/** Consejos que dependen de dónde está puesta la planta. */
export function advice(care, placement) {
  const out = [];
  const diff = care.light - placement.light;
  if (diff >= 1.5) {
    out.push('Necesita más luz de la que recibe ahí: acercala a una ventana luminosa o a un lugar más soleado.');
  } else if (placement.outdoor && -diff >= 2) {
    out.push('Ahí recibe más sol del que necesita: dale sombra o luz filtrada para que no se queme.');
  }
  if (placement.outdoor && care.minTemp > 3) {
    out.push(`No tolera el frío: entrala cuando la mínima baje de ${care.minTemp} °C.`);
  }
  if (!placement.outdoor && care.humidity === 'alta') {
    out.push('Le gusta la humedad: rociá las hojas o apoyala sobre una bandeja con piedras y agua.');
  }
  if (care.generic) {
    out.push('Es una estimación general: no tengo datos de esta especie. Ajustá la frecuencia según cómo responda.');
  }
  return out;
}
