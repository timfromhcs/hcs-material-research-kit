import { writeFileSync } from "node:fs";
import { createCrystal, exportStructure, importStructure } from "@hcs-materials/core";

const s = createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na", "Cl"] });
const cif = exportStructure(s, "cif");
writeFileSync("scripts/out.cif", cif, "utf8");
console.log(cif.split("\n").slice(-12).join("\n"));
const back = importStructure(cif, "x.cif");
console.log(back.structure.sites.map((x) => `${x.species} ${x.fractional_position.join(",")}`).join("\n"));
