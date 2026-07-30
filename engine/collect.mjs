// engine/collect.mjs — gh CLI -> real PR data -> tokens for resolve-spec.mjs.
// Phase 2: "aus echten Daten". Talks to GitHub only through `gh` (execFileSync,
// argv array — no shell interpolation of the ref), so a hostile PR title or
// filename can't inject a shell command.
//
// Usage: node engine/collect.mjs <owner/repo#number> [outPath]
//   defaults: outPath -> stdout only (no file written)

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REF_RE = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
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

export function collect(ref) {
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
  };

  return tokens;
}

// --- CLI ----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("collect.mjs")) {
  const ref = process.argv[2];
  if (!ref) {
    console.error("usage: node engine/collect.mjs <owner/repo#number> [outPath]");
    process.exit(1);
  }
  const outPath = process.argv[3];
  const tokens = collect(ref);
  const json = JSON.stringify(tokens, null, 2);
  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.error(`collected ${ref} -> ${outPath}`);
  } else {
    console.log(json);
  }
}
