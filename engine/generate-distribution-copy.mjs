// engine/generate-distribution-copy.mjs — resolved reel-spec.json + tokens.json ->
// per-platform title/description/hashtag copy for YouTube / Instagram / TikTok.
// Phase 6 (PLAN.md §6, Stufe 2): the "generate-distribution-copy" building block —
// the only distribution piece that needs zero gated API access, so it's real and
// testable today, unlike distribute/*.mjs (posting), which is API-credential-gated.
//
// Usage: node engine/generate-distribution-copy.mjs [specPath] [tokensPath] [outDir]
//   defaults: build/reel-spec.json, build/tokens.json, build/distribution

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const clip = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = (arr) => [...new Set(arr)];

// voice.lexicon/forbidden are `oneOf` free-text-string | structured (map/array) per
// reel-spec.schema.json — free text is human guidance, not machine-enforceable here.
function lexiconMap(lexicon) {
  return lexicon && typeof lexicon === "object" ? lexicon : {};
}
function forbiddenList(forbidden) {
  return Array.isArray(forbidden) ? forbidden : [];
}

// Applies the brand's word-choice map, then hard-fails if a forbidden word survives —
// same "gate, don't silently patch" discipline as seam-gate.mjs/quality-check.mjs:
// a forbidden word means the *source token* is wrong, not that this function should
// quietly mangle it.
export function applyVoice(text, voice = {}) {
  let out = text;
  for (const [from, to] of Object.entries(lexiconMap(voice.lexicon))) {
    out = out.replace(new RegExp(`\\b${escapeRe(from)}\\b`, "gi"), to);
  }
  const hits = forbiddenList(voice.forbidden).filter((w) =>
    new RegExp(`\\b${escapeRe(w)}\\b`, "i").test(out)
  );
  if (hits.length) {
    throw new Error(
      `generated copy uses forbidden word(s): ${hits.join(", ")} — fix the source token (PR title/body), don't strip it here`
    );
  }
  return out;
}

function toTag(s) {
  return (s ?? "").replace(/[^a-zA-Z0-9]+/g, "");
}

export function buildHashtags(tokens) {
  const pr = tokens.pr ?? {};
  const repoTag = toTag(pr.repo);
  const labelTags = (pr.labels ?? []).map(toTag).filter(Boolean);
  const base = ["coding", "buildinpublic", "softwareengineering"];
  return uniq([repoTag, ...labelTags, ...base].filter(Boolean)).slice(0, 8);
}

export function generateCopy({ spec, tokens }) {
  const voice = spec.voice ?? {};
  const channel = spec.channel ?? {};
  const pr = tokens.pr ?? {};

  const titleRaw = tokens.hook_line || pr.title || "New release";
  const title = applyVoice(clip(titleRaw, 95), voice);

  const bodyRaw = [
    tokens.problem_body,
    tokens.result_metric ? `${tokens.result_metric} ${tokens.result_sub ?? ""}`.trim() : null,
  ]
    .filter(Boolean)
    .join(" — ");

  const tags = buildHashtags(tokens);
  const hashtagLine = tags.map((t) => `#${t}`).join(" ");

  const youtube = {
    title: clip(title, 100),
    description: applyVoice(
      [bodyRaw, pr.url ? `PR: ${pr.url}` : null, channel.handle].filter(Boolean).join("\n\n"),
      voice
    ),
    tags: tags.slice(0, 15),
  };

  const instagram = {
    caption: applyVoice([title, bodyRaw, hashtagLine].filter(Boolean).join("\n\n"), voice),
  };

  const tiktok = {
    caption: clip(applyVoice([title, hashtagLine].filter(Boolean).join(" "), voice), 150),
  };

  return {
    meta: {
      id: spec.meta?.id,
      source: pr.owner ? `${pr.owner}/${pr.repo}#${pr.number}` : undefined,
      generatedAt: new Date().toISOString(),
    },
    youtube,
    instagram,
    tiktok,
  };
}

// --- CLI ----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("generate-distribution-copy.mjs")) {
  const specPath = resolve(process.argv[2] ?? join(root, "build/reel-spec.json"));
  const tokensPath = resolve(process.argv[3] ?? join(root, "build/tokens.json"));
  const outDir = resolve(process.argv[4] ?? join(root, "build/distribution"));

  if (!existsSync(specPath)) {
    console.error(`spec not found: ${specPath} (run engine/resolve-spec.mjs first)`);
    process.exit(1);
  }
  if (!existsSync(tokensPath)) {
    console.error(`tokens not found: ${tokensPath} (run engine/collect.mjs first)`);
    process.exit(1);
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const copy = generateCopy({ spec, tokens });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "copy.json"), JSON.stringify(copy, null, 2), "utf8");
  writeFileSync(
    join(outDir, "youtube.txt"),
    `${copy.youtube.title}\n\n${copy.youtube.description}\n\nTags: ${copy.youtube.tags.join(", ")}\n`,
    "utf8"
  );
  writeFileSync(join(outDir, "instagram.txt"), copy.instagram.caption + "\n", "utf8");
  writeFileSync(join(outDir, "tiktok.txt"), copy.tiktok.caption + "\n", "utf8");

  console.log(`✓ distribution copy -> ${outDir}`);
  console.log(`  youtube:   "${copy.youtube.title}" (${copy.youtube.tags.length} tags)`);
  console.log(`  instagram: ${copy.instagram.caption.length} chars`);
  console.log(`  tiktok:    ${copy.tiktok.caption.length} chars`);
}
