/**
 * Element data.
 *
 * Atomic masses are approximate standard atomic weights (u) intended for
 * density estimates, unit conversion and MD mass assignment. They are not
 * isotopic compositions and must not be used where exact isotopic masses are
 * required. Values for elements without a stable isotope use the mass number
 * of the longest-lived isotope.
 */

export interface ElementInfo {
  readonly z: number;
  readonly symbol: string;
  readonly name: string;
  /** Approximate standard atomic weight in unified atomic mass units. */
  readonly mass: number;
  /** Pauling electronegativity; used only for conventional formula ordering. */
  readonly electronegativity?: number;
  /** Groups for display/filtering only; never used to infer physics. */
  readonly category: string;
}

const RAW: ReadonlyArray<readonly [number, string, string, number, string]> = [
  [1, "H", "Hydrogen", 1.008, "nonmetal"],
  [2, "He", "Helium", 4.0026, "noble gas"],
  [3, "Li", "Lithium", 6.94, "alkali metal"],
  [4, "Be", "Beryllium", 9.0122, "alkaline earth metal"],
  [5, "B", "Boron", 10.81, "metalloid"],
  [6, "C", "Carbon", 12.011, "nonmetal"],
  [7, "N", "Nitrogen", 14.007, "nonmetal"],
  [8, "O", "Oxygen", 15.999, "nonmetal"],
  [9, "F", "Fluorine", 18.998, "halogen"],
  [10, "Ne", "Neon", 20.18, "noble gas"],
  [11, "Na", "Sodium", 22.99, "alkali metal"],
  [12, "Mg", "Magnesium", 24.305, "alkaline earth metal"],
  [13, "Al", "Aluminium", 26.982, "post-transition metal"],
  [14, "Si", "Silicon", 28.085, "metalloid"],
  [15, "P", "Phosphorus", 30.974, "nonmetal"],
  [16, "S", "Sulfur", 32.06, "nonmetal"],
  [17, "Cl", "Chlorine", 35.45, "halogen"],
  [18, "Ar", "Argon", 39.948, "noble gas"],
  [19, "K", "Potassium", 39.098, "alkali metal"],
  [20, "Ca", "Calcium", 40.078, "alkaline earth metal"],
  [21, "Sc", "Scandium", 44.956, "transition metal"],
  [22, "Ti", "Titanium", 47.867, "transition metal"],
  [23, "V", "Vanadium", 50.942, "transition metal"],
  [24, "Cr", "Chromium", 51.996, "transition metal"],
  [25, "Mn", "Manganese", 54.938, "transition metal"],
  [26, "Fe", "Iron", 55.845, "transition metal"],
  [27, "Co", "Cobalt", 58.933, "transition metal"],
  [28, "Ni", "Nickel", 58.693, "transition metal"],
  [29, "Cu", "Copper", 63.546, "transition metal"],
  [30, "Zn", "Zinc", 65.38, "transition metal"],
  [31, "Ga", "Gallium", 69.723, "post-transition metal"],
  [32, "Ge", "Germanium", 72.63, "metalloid"],
  [33, "As", "Arsenic", 74.922, "metalloid"],
  [34, "Se", "Selenium", 78.971, "nonmetal"],
  [35, "Br", "Bromine", 79.904, "halogen"],
  [36, "Kr", "Krypton", 83.798, "noble gas"],
  [37, "Rb", "Rubidium", 85.468, "alkali metal"],
  [38, "Sr", "Strontium", 87.62, "alkaline earth metal"],
  [39, "Y", "Yttrium", 88.906, "transition metal"],
  [40, "Zr", "Zirconium", 91.224, "transition metal"],
  [41, "Nb", "Niobium", 92.906, "transition metal"],
  [42, "Mo", "Molybdenum", 95.95, "transition metal"],
  [43, "Tc", "Technetium", 98, "transition metal"],
  [44, "Ru", "Ruthenium", 101.07, "transition metal"],
  [45, "Rh", "Rhodium", 102.91, "transition metal"],
  [46, "Pd", "Palladium", 106.42, "transition metal"],
  [47, "Ag", "Silver", 107.87, "transition metal"],
  [48, "Cd", "Cadmium", 112.41, "transition metal"],
  [49, "In", "Indium", 114.82, "post-transition metal"],
  [50, "Sn", "Tin", 118.71, "post-transition metal"],
  [51, "Sb", "Antimony", 121.76, "metalloid"],
  [52, "Te", "Tellurium", 127.6, "metalloid"],
  [53, "I", "Iodine", 126.9, "halogen"],
  [54, "Xe", "Xenon", 131.29, "noble gas"],
  [55, "Cs", "Caesium", 132.91, "alkali metal"],
  [56, "Ba", "Barium", 137.33, "alkaline earth metal"],
  [57, "La", "Lanthanum", 138.91, "lanthanide"],
  [58, "Ce", "Cerium", 140.12, "lanthanide"],
  [59, "Pr", "Praseodymium", 140.91, "lanthanide"],
  [60, "Nd", "Neodymium", 144.24, "lanthanide"],
  [61, "Pm", "Promethium", 145, "lanthanide"],
  [62, "Sm", "Samarium", 150.36, "lanthanide"],
  [63, "Eu", "Europium", 151.96, "lanthanide"],
  [64, "Gd", "Gadolinium", 157.25, "lanthanide"],
  [65, "Tb", "Terbium", 158.93, "lanthanide"],
  [66, "Dy", "Dysprosium", 162.5, "lanthanide"],
  [67, "Ho", "Holmium", 164.93, "lanthanide"],
  [68, "Er", "Erbium", 167.26, "lanthanide"],
  [69, "Tm", "Thulium", 168.93, "lanthanide"],
  [70, "Yb", "Ytterbium", 173.05, "lanthanide"],
  [71, "Lu", "Lutetium", 174.97, "lanthanide"],
  [72, "Hf", "Hafnium", 178.49, "transition metal"],
  [73, "Ta", "Tantalum", 180.95, "transition metal"],
  [74, "W", "Tungsten", 183.84, "transition metal"],
  [75, "Re", "Rhenium", 186.21, "transition metal"],
  [76, "Os", "Osmium", 190.23, "transition metal"],
  [77, "Ir", "Iridium", 192.22, "transition metal"],
  [78, "Pt", "Platinum", 195.08, "transition metal"],
  [79, "Au", "Gold", 196.97, "transition metal"],
  [80, "Hg", "Mercury", 200.59, "transition metal"],
  [81, "Tl", "Thallium", 204.38, "post-transition metal"],
  [82, "Pb", "Lead", 207.2, "post-transition metal"],
  [83, "Bi", "Bismuth", 208.98, "post-transition metal"],
  [84, "Po", "Polonium", 209, "post-transition metal"],
  [85, "At", "Astatine", 210, "halogen"],
  [86, "Rn", "Radon", 222, "noble gas"],
  [87, "Fr", "Francium", 223, "alkali metal"],
  [88, "Ra", "Radium", 226, "alkaline earth metal"],
  [89, "Ac", "Actinium", 227, "actinide"],
  [90, "Th", "Thorium", 232.04, "actinide"],
  [91, "Pa", "Protactinium", 231.04, "actinide"],
  [92, "U", "Uranium", 238.03, "actinide"],
  [93, "Np", "Neptunium", 237, "actinide"],
  [94, "Pu", "Plutonium", 244, "actinide"],
  [95, "Am", "Americium", 243, "actinide"],
  [96, "Cm", "Curium", 247, "actinide"],
  [97, "Bk", "Berkelium", 247, "actinide"],
  [98, "Cf", "Californium", 251, "actinide"],
  [99, "Es", "Einsteinium", 252, "actinide"],
  [100, "Fm", "Fermium", 257, "actinide"],
  [101, "Md", "Mendelevium", 258, "actinide"],
  [102, "No", "Nobelium", 259, "actinide"],
  [103, "Lr", "Lawrencium", 266, "actinide"],
  [104, "Rf", "Rutherfordium", 267, "transition metal"],
  [105, "Db", "Dubnium", 268, "transition metal"],
  [106, "Sg", "Seaborgium", 269, "transition metal"],
  [107, "Bh", "Bohrium", 270, "transition metal"],
  [108, "Hs", "Hassium", 269, "transition metal"],
  [109, "Mt", "Meitnerium", 278, "transition metal"],
  [110, "Ds", "Darmstadtium", 281, "transition metal"],
  [111, "Rg", "Roentgenium", 282, "transition metal"],
  [112, "Cn", "Copernicium", 285, "transition metal"],
  [113, "Nh", "Nihonium", 286, "post-transition metal"],
  [114, "Fl", "Flerovium", 289, "post-transition metal"],
  [115, "Mc", "Moscovium", 290, "post-transition metal"],
  [116, "Lv", "Livermorium", 293, "post-transition metal"],
  [117, "Ts", "Tennessine", 294, "halogen"],
  [118, "Og", "Oganesson", 294, "noble gas"],
];

/**
 * Pauling electronegativity (approximate, one decimal is enough here).
 * Used exclusively for conventional formula ordering — never for physics.
 * Elements without a tabulated value are omitted.
 */
const ELECTRONEGATIVITY: Record<string, number> = {
  H: 2.2, Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98,
  Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.9, P: 2.19, S: 2.58, Cl: 3.16, K: 0.82,
  Ca: 1.0, Sc: 1.36, Ti: 1.54, V: 1.63, Cr: 1.66, Mn: 1.55, Fe: 1.83, Co: 1.88,
  Ni: 1.91, Cu: 1.9, Zn: 1.65, Ga: 1.81, Ge: 2.01, As: 2.18, Se: 2.55, Br: 2.96,
  Kr: 3.0, Rb: 0.82, Sr: 0.95, Y: 1.22, Zr: 1.33, Nb: 1.6, Mo: 2.16, Tc: 1.9,
  Ru: 2.2, Rh: 2.28, Pd: 2.2, Ag: 1.93, Cd: 1.69, In: 1.78, Sn: 1.96, Sb: 2.05,
  Te: 2.1, I: 2.66, Xe: 2.6, Cs: 0.79, Ba: 0.89, La: 1.1, Ce: 1.12, Pr: 1.13,
  Nd: 1.14, Pm: 1.13, Sm: 1.17, Eu: 1.2, Gd: 1.2, Tb: 1.1, Dy: 1.22, Ho: 1.23,
  Er: 1.24, Tm: 1.25, Yb: 1.1, Lu: 1.27, Hf: 1.3, Ta: 1.5, W: 2.36, Re: 1.9,
  Os: 2.2, Ir: 2.2, Pt: 2.28, Au: 2.54, Hg: 2.0, Tl: 1.62, Pb: 2.33, Bi: 2.02,
  Po: 2.0, At: 2.2, Fr: 0.7, Ra: 0.9, Ac: 1.1, Th: 1.3, Pa: 1.5, U: 1.38,
  Np: 1.36, Pu: 1.28, Am: 1.3, Cm: 1.3, Bk: 1.3, Cf: 1.3, Es: 1.3, Fm: 1.3,
};

export const ELEMENTS: readonly ElementInfo[] = RAW.map(([z, symbol, name, mass, category]) => ({
  z,
  symbol,
  name,
  mass,
  electronegativity: ELECTRONEGATIVITY[symbol],
  category,
}));

const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol, e]));/** Strips a trailing count/label suffix, e.g. "Ni2" or "Ni_2" -> "Ni". */
export function baseSymbol(species: string): string {
  const match = /^([A-Z][a-z]?)/.exec(species);
  return match?.[1] ?? species;
}

export function getElement(species: string): ElementInfo | undefined {
  return BY_SYMBOL.get(baseSymbol(species));
}

export function isKnownElement(species: string): boolean {
  return BY_SYMBOL.has(baseSymbol(species));
}

/** Throws for unknown species; used where a mass is required. */
export function atomicMass(species: string): number {
  const element = getElement(species);
  if (!element) {
    throw new Error(
      `Unknown element '${species}'. Add it to the element table before requesting a mass.`,
    );
  }
  return element.mass;
}

export function elementSymbols(): string[] {
  return ELEMENTS.map((e) => e.symbol);
}
