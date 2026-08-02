// engine/resolve-spec.mjs — the merge: channel.json + brands/<slug> + archetypes/<name>
// + tokens (from collect.mjs) -> ONE fully-resolved reel-spec.json.
// This is the translator §7 of PLAN.md talks about: two foreign schemas never
// fit directly, this is what makes them fit the base plate.
//
// Merge rule (fixed, per reel-spec.schema.json / PLAN.md §1):
//   - channel always wins layout/format.
//   - brand + voice always win color/font/motion/tone.
//   - captions are the split case: position/size from channel, accent color from brand
//     (both already live in their own objects, so no field-level conflict to resolve here).
//
// Usage:
//   node engine/resolve-spec.mjs --archetype bugfix-reel --brand projekt-a \
//     --tokens build/tokens.json [--out build/reel-spec.json] [--format 9:16]
//     [--pace fast] [--capture]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (p) => readFileSync(join(root, p), "utf8");
const readJSON = (p) => JSON.parse(readText(p));

function frontMatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("no YAML front matter found");
  return YAML.parse(m[1]);
}

// --- placeholder substitution --------------------------------------------------
// "{{key}}" (whole-string) keeps the token's native type; "text {{key}} text"
// (partial match) stringifies. Unknown keys are left as-is (visible = catchable).
function fillTemplate(node, tokens) {
  if (typeof node === "string") {
    const exact = node.match(/^\{\{([\w.]+)\}\}$/);
    if (exact) {
      const v = get(tokens, exact[1]);
      return v === undefined ? node : v;
    }
    return node.replace(/\{\{([\w.]+)\}\}/g, (whole, key) => {
      const v = get(tokens, key);
      return v === undefined ? whole : String(v);
    });
  }
  if (Array.isArray(node)) return node.map((v) => fillTemplate(v, tokens));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillTemplate(v, tokens)]));
  }
  return node;
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

// --- schema gate ----------------------------------------------------------------
function validateSpec(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = readJSON("reel-spec.schema.json");
  const validate = ajv.compile(schema);
  if (!validate(spec)) {
    throw new Error("resolved spec fails reel-spec.schema.json:\n  " + ajv.errorsText(validate.errors, { separator: "\n  " }));
  }
}

// --- the merge --------------------------------------------------------------
export function resolveSpec({ archetype, brandSlug, tokens, format, pace, beatSync, energyCurve, capture, id, sourceKind = "github_pr" }) {
  const channel = readJSON("channel.json");
  const brand = readJSON(`brands/${brandSlug}/brand.json`);
  const voice = frontMatter(readText(`brands/${brandSlug}/voice.md`));
  const template = readJSON(`archetypes/${archetype}/beats.json`);

  const beats = fillTemplate(template.beats, tokens);

  const pr = tokens.pr ?? {};
  // ROADMAP-NEXT 3.2: tokens.source (written by collect.mjs's github_pr/url/brief
  // collectors) is now the primary way to know a spec's source kind+ref. Older
  // tokens files predating this change (e.g. an on-disk build/tokens.json from
  // before this pass) have no `source` field, so fall back to the old
  // pr-owner-derived github_pr behavior for backward compatibility.
  const tokenSource = tokens.source ?? {};
  const day = new Date().toISOString().slice(0, 10);

  const kind = tokenSource.kind ?? sourceKind;
  const ref = tokenSource.ref ?? (pr.owner ? `${pr.owner}/${pr.repo}#${pr.number}` : undefined);

  const spec = {
    meta: {
      id: id ?? `${brand.slug}-${archetype}-${day}`,
      duration: "auto",
      format: format ?? "9:16", // channel wins layout/format
      archetype,
    },
    channel,
    brand, // brand+voice win color/font/motion/tone
    voice,
    tempo: {
      pace: pace ?? template.tempo?.pace ?? "medium",
      beat_sync: beatSync ?? template.tempo?.beat_sync ?? false,
      energy_curve: energyCurve ?? template.tempo?.energy_curve ?? "flat",
    },
    source: {
      kind,
      ref,
      capture: capture ?? false,
    },
    beats,
  };
  if (spec.source.ref === undefined) delete spec.source.ref;

  validateSpec(spec);
  return spec;
}

// --- CLI ----------------------------------------------------------------------
function parseArgs(argv) {
  const args = { flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args.flags[key] = true;
      } else {
        args.flags[key] = next;
        i++;
      }
    }
  }
  return args.flags;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("resolve-spec.mjs")) {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.archetype || !flags.brand || !flags.tokens) {
    console.error(
      "usage: node engine/resolve-spec.mjs --archetype <name> --brand <slug> --tokens <path> " +
      "[--out <path>] [--format 9:16] [--pace fast] [--capture]"
    );
    process.exit(1);
  }
  const tokensPath = resolve(flags.tokens);
  if (!existsSync(tokensPath)) {
    console.error(`tokens file not found: ${tokensPath} (run engine/collect.mjs first)`);
    process.exit(1);
  }
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));

  const spec = resolveSpec({
    archetype: flags.archetype,
    brandSlug: flags.brand,
    tokens,
    format: flags.format,
    pace: flags.pace,
    capture: flags.capture === true,
  });

  const json = JSON.stringify(spec, null, 2);
  if (flags.out) {
    writeFileSync(resolve(flags.out), json, "utf8");
    console.log(`resolved -> ${flags.out}  (${spec.beats.length} beats, archetype ${spec.meta.archetype})`);
  } else {
    console.log(json);
  }
}
