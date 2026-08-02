// engine/collect.mjs — turn a source ref into tokens for resolve-spec.mjs.
// Phase 2: "aus echten Daten" (github_pr only). ROADMAP-NEXT 3.2 adds two more
// source kinds (url, brief) — kept in this one file, several functions, no new
// module layer, per DECISIONS.md's "don't over-abstract a single-file phase"
// convention (same call as tts.mjs/broll.mjs).
//
// github_pr talks to GitHub only through `gh` (execFileSync, argv array — no
// shell interpolation of the ref), so a hostile PR title or filename can't
// inject a shell command.
//
// Usage: node engine/collect.mjs <ref> [outPath] [--kind github_pr|url|brief]
//   ref auto-detected if --kind omitted: owner/repo#123 -> github_pr,
//   http(s):// -> url, anything else -> brief (a path or raw text).
//   defaults: outPath -> stdout only (no file written)

import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const REF_RE = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const URL_RE = /^https?:\/\//i;
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock)$/;

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function parseRef(ref) {
  const m = REF_RE.exec(ref);
  if (!m) throw new Error(`ref must look like owner/repo#123, got: ${ref}`);
  const [, owner, repo, number] = m;
  return { owner, repo, number };
}

// One representative file: the largest total change that isn't a lockfile,
// falling back to the largest overall if everything is a lockfile.
function pickFile(files) {
  const ranked = [...files].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
  return ranked.find((f) => !LOCKFILES.test(f.filename)) ?? ranked[0] ?? null;
}

// Pull the first added/removed source line out of a unified-diff patch,
// stripped of the +/- marker and trimmed for a one-line caption card.
function firstLines(patch) {
  if (!patch) return { added: "", removed: "" };
  const lines = patch.split("\n");
  const clip = (s) => (s.length > 60 ? s.slice(0, 57) + "..." : s);
  const added = lines.find((l) => l.startsWith("+") && !l.startsWith("+++"));
  const removed = lines.find((l) => l.startsWith("-") && !l.startsWith("---"));
  return {
    added: added ? clip(added.slice(1).trim()) : "",
    removed: removed ? clip(removed.slice(1).trim()) : "",
  };
}

const clipText = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function collectGithubPr(ref) {
  const { owner, repo, number } = parseRef(ref);

  const pr = JSON.parse(
    gh(["api", `repos/${owner}/${repo}/pulls/${number}`,
      "--jq", "{title,author:.user.login,merged_at,additions,deletions,changed_files,body,labels:[.labels[].name],html_url}"])
  );
  const files = JSON.parse(
    gh(["api", `repos/${owner}/${repo}/pulls/${number}/files`,
      "--jq", "[.[] | {filename,additions,deletions,status,patch}]"])
  );

  const file = pickFile(files) ?? { filename: "", additions: 0, deletions: 0, patch: "" };
  const { added, removed } = firstLines(file.patch);

  const problemBody = pr.body
    ? clipText(pr.body.replace(/\r?\n+/g, " ").trim(), 90)
    : `Merged by ${pr.author}${pr.labels.length ? " · " + pr.labels.join(", ") : ""}`;

  const tokens = {
    pr: {
      owner, repo, number: Number(number),
      title: pr.title,
      url: pr.html_url,
      author: pr.author,
      labels: pr.labels,
      mergedAt: pr.merged_at,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    },
    hook_line: clipText(pr.title, 60),
    problem_title: clipText(pr.title, 50),
    problem_body: problemBody,
    diff_file: file.filename,
    diff_removed: removed,
    diff_added: added,
    result_metric: `+${pr.additions} -${pr.deletions}`,
    result_sub: `across ${pr.changed_files} file${pr.changed_files === 1 ? "" : "s"}`,
    source: { kind: "github_pr", ref: `${owner}/${repo}#${number}` },
  };

  return tokens;
}

// --- url collector --------------------------------------------------------------
// This is a user-input-time call, not a background job: unlike distribute/*.mjs
// or broll.mjs (which degrade a missing API key/live-call failure to a
// recorded "skipped" item so the rest of a batch can proceed), a bad/unreachable
// URL here means the *one and only* source for this reel is broken — there is
// nothing sensible to degrade to. So collectUrl THROWS loudly on any fetch
// failure or non-2xx response instead of silently producing empty tokens.
function stripHtmlToText(html) {
  const noScriptStyle = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const noTags = noScriptStyle.replace(/<[^>]+>/g, " ");
  const decoded = noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\s+/g, " ").trim();
}

export async function collectUrl(ref) {
  let res;
  try {
    res = await fetch(ref);
  } catch (err) {
    throw new Error(`failed to fetch url source ${ref}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`failed to fetch url source ${ref}: HTTP ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtmlToText(titleMatch[1]) : ref;

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);
  const description = descMatch ? stripHtmlToText(descMatch[1]) : stripHtmlToText(html);

  const host = new URL(ref).host;

  const tokens = {
    url: { title, url: ref, host, description: clipText(description, 90) },
    hook_line: clipText(title, 60),
    problem_title: clipText(title, 50),
    problem_body: clipText(description, 90),
    diff_file: "",
    diff_removed: "",
    diff_added: "",
    result_metric: host,
    result_sub: "source: url",
    source: { kind: "url", ref },
  };

  return tokens;
}

// --- brief collector -------------------------------------------------------------
// No network call. ref is either an existing file path (raw brief text) or,
// if not an existing path, the literal raw brief text itself (a convenience
// so a caller doesn't need a scratch file for a quick brief).
function splitHookBody(text) {
  const trimmed = text.trim();
  const sentenceMatch = trimmed.match(/^([\s\S]*?[.!?])\s+([\s\S]*)$/);
  if (sentenceMatch) {
    return { hook: sentenceMatch[1].trim(), body: sentenceMatch[2].trim() };
  }
  const newlineIdx = trimmed.indexOf("\n");
  if (newlineIdx !== -1) {
    return { hook: trimmed.slice(0, newlineIdx).trim(), body: trimmed.slice(newlineIdx + 1).trim() };
  }
  return { hook: trimmed, body: "" };
}

export function collectBrief(ref) {
  const text = existsSync(ref) ? readFileSync(ref, "utf8") : ref;
  const { hook, body } = splitHookBody(text);

  const tokens = {
    brief: { text, hook, body },
    hook_line: clipText(hook, 60),
    problem_title: clipText(hook, 50),
    problem_body: clipText(body || hook, 90),
    diff_file: "",
    diff_removed: "",
    diff_added: "",
    result_metric: "",
    result_sub: "source: brief",
    source: { kind: "brief", ref },
  };

  return tokens;
}

// --- dispatch --------------------------------------------------------------------
export function detectKind(ref) {
  if (REF_RE.test(ref)) return "github_pr";
  if (URL_RE.test(ref)) return "url";
  return "brief";
}

export async function collect(ref, kind) {
  const resolvedKind = kind ?? detectKind(ref);
  switch (resolvedKind) {
    case "github_pr":
      return collectGithubPr(ref);
    case "url":
      return await collectUrl(ref);
    case "brief":
      return collectBrief(ref);
    default:
      throw new Error(`unknown source kind: ${resolvedKind}`);
  }
}

// --- CLI ----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("collect.mjs")) {
  const argv = process.argv.slice(2);
  let kind;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kind") {
      kind = argv[i + 1];
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  const [ref, outPath] = positional;
  if (!ref) {
    console.error("usage: node engine/collect.mjs <ref> [outPath] [--kind github_pr|url|brief]");
    process.exit(1);
  }
  const tokens = await collect(ref, kind);
  const json = JSON.stringify(tokens, null, 2);
  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.error(`collected ${ref} -> ${outPath}`);
  } else {
    console.log(json);
  }
}
