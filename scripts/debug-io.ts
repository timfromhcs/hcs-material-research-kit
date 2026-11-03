import { readFileSync } from "node:fs";
import {
  exportStructure,
  importStructure,
  readCif,
  readXyz,
  structureHash,
  createCrystal,
} from "@hcs-materials/core";

const fixtures = "tests/fixtures/structures";
const nacl = createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na", "Cl"] });
const cif = exportStructure(nacl, "cif");
const again = readCif(cif);
console.log("cif hash equal:", structureHash(again.structure) === structureHash(nacl));
console.log("orig site0", nacl.sites[0]);
console.log("new  site0", again.structure.sites[0]);
console.log("orig site4", nacl.sites[4]);
console.log("new  site4", again.structure.sites[4]);
console.log("cif head:\n", cif.split("\n").slice(0, 12).join("\n"));

const ext = readFileSync(`${fixtures}/nacl_ext.xyz`, "utf8");
console.log("ext comment:", JSON.stringify(ext.split(/\r?\n/)[1]));
const xyz = readXyz(ext, "nacl_ext.xyz");
console.log("pbc:", xyz.structure.pbc, "volume:", JSON.stringify(xyz.structure.lattice.vectors));
console.log("detect:", importStructure(ext, "nacl_ext.xyz").format);
