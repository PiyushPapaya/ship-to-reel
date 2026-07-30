// engine/validate.mjs — Phase 0 verification harness.
// Proves the base plate (reel-spec.schema.json) is a valid JSON Schema and that
// every authored data file conforms to it. Exits non-zero on any failure so it
// can gate CI and the loop discipline ("never claim done without proof").

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const readJSON = (p) => JSON.parse(read(p));

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

// --- Extract YAML front matter from a markdown file ---------------------------
function frontMatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("no YAML front matter found");
  return YAML.parse(m[1]);
}

// --- Recursive semantic check: every {min,max} range has min <= max -----------
function rangeErrors(node, path = "$") {
  const errs = [];
  if (Array.isArray(node)) {
    node.forEach((v, i) => errs.push(...rangeErrors(v, `${path}[${i}]`)));
  } else if (node && typeof node === "object") {
    if (
      typeof node.min === "number" &&
      typeof node.max === "number" &&
      Object.keys(node).length === 2 &&
      node.min > node.max
    ) {
      errs.push(`${path}: min (${node.min}) > max (${node.max})`);
    }
    for (const [k, v] of Object.entries(node)) {
      errs.push(...rangeErrors(v, `${path}.${k}`));
    }
  }
  return errs;
}

// --- Compile the base plate ---------------------------------------------------
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schema = readJSON("reel-spec.schema.json");
const schemaId = schema.$id;

try {
  ajv.addSchema(schema);
  record("schema compiles (valid JSON Schema 2020-12, strict)", true);
} catch (e) {
  record("schema compiles", false, e.message);
  report();
}

// Retrieve sub-validators by JSON pointer into $defs.
const getDef = (def) => {
  const v = ajv.getSchema(`${schemaId}#/$defs/${def}`);
  if (!v) throw new Error(`could not resolve $defs/${def}`);
  return v;
};

// --- Validation cases ---------------------------------------------------------
const cases = [
  { name: "examples/reel-spec.example.json vs full schema", validate: ajv.getSchema(schemaId), data: readJSON("examples/reel-spec.example.json") },
  { name: "channel.json vs $defs/channel", validate: getDef("channel"), data: readJSON("channel.json") },
  { name: "brands/projekt-a/brand.json vs $defs/brand", validate: getDef("brand"), data: readJSON("brands/projekt-a/brand.json") },
  { name: "brands/projekt-a/voice.md front matter vs $defs/voice", validate: getDef("voice"), data: frontMatter(read("brands/projekt-a/voice.md")) },
];

for (const c of cases) {
  let ok = false;
  let detail;
  try {
    ok = c.validate(c.data);
    if (!ok) detail = ajv.errorsText(c.validate.errors, { separator: "\n    " });
    else {
      const re = rangeErrors(c.data);
      if (re.length) {
        ok = false;
        detail = re.join("\n    ");
      }
    }
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  record(c.name, ok, detail);
}

report();

// --- Reporter -----------------------------------------------------------------
function report() {
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.name}`);
    } else {
      failed++;
      console.log(`  ✗ ${r.name}`);
      if (r.detail) console.log(`    ${r.detail}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
