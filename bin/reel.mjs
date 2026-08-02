#!/usr/bin/env node
// bin/reel.mjs — ROADMAP-NEXT.md Tier 4.1 "Unify the CLI".
//
// Every engine/*.mjs script has its own argv contract (assemble -> dir,
// seam-gate -> file, render -> dir, distribute -> copy,video, ...) — see the
// per-script "Usage:" comments this dispatcher was written against. That's
// friction, not a design. This is a THIN dispatcher, not a rewrite: it does not
// touch a single line of engine/*.mjs's own arg parsing. It just normalizes the
// outside-facing convention to "every subcommand takes a project/build dir as
// its primary positional arg" and translates that into whatever the underlying
// script actually expects, then passes any extra flags through unchanged.
//
// Usage:
//   node bin/reel.mjs <cmd> [dir] [...extra args/flags, passed through as-is]
//
// Commands (dir defaults to "build" unless noted):
//   collect <owner/repo#number> [outPath]         -- pass-through, no dir concept
//   resolve-spec [dir] --archetype X --brand Y [--tokens P] [--out P] [...flags]
//   assemble [dir] [specPath]
//   capture [dir] [...--spec/--url/--out flags]
//   broll [dir] [...--spec/--out flags]
//   tts [dir] [...--text/--out/--voice/--provider flags]
//   align-captions [dir] [specPath]
//   beat-sync <audioFile>                          -- pass-through, no dir concept
//   beat-sync --snap-test <bpm>                     -- pass-through
//   seam-gate [dir]                                -- resolves to <dir>/index.html
//   render [dir] [output]
//   quality-check [dir] [mp4] [--scores path] [--auto]
//   score-frames [dir] [--out path] [--max-frames N] -- resolves to <dir>/quality/frames
//   distribution-copy [dir]                        -- resolves spec/tokens/out under dir
//   distribute [dir]                               -- resolves copy.json/reel.mp4 under dir
//   validate                                       -- no dir arg (repo-wide schema gate)
//   build [dir] [specPath]                          -- assemble -> seam-gate -> align-captions -> render
//
// Every command still works exactly as documented by calling `node engine/<x>.mjs`
// directly — this is additive, not a breaking rename.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = (name) => join(root, "engine", name);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if (r.error) {
    console.error(`✗ failed to run: ${cmd} ${args.join(" ")}\n  ${r.error.message}`);
    process.exit(1);
  }
  return r.status ?? 0;
}

function runOrExit(cmd, args) {
  const status = run(cmd, args);
  if (status !== 0) process.exit(status);
}

function isFlag(a) {
  return typeof a === "string" && a.startsWith("--");
}

// Splits [dir, ...rest] out of argv when the first token isn't itself a flag.
// An explicit leading "--" argv means "no dir given, use the default" so
// `reel <cmd> --scores foo.json` still works.
function takeDir(argv, fallback = "build") {
  if (argv.length && !isFlag(argv[0])) {
    return { dir: resolve(argv[0]), rest: argv.slice(1) };
  }
  return { dir: resolve(fallback), rest: argv };
}

function specDefaultFor(dir) {
  const inDir = join(dir, "reel-spec.json");
  return existsSync(inDir) ? inDir : join(root, "examples/reel-spec.example.json");
}

const [, , cmd, ...rest] = process.argv;

const USAGE = `usage: node bin/reel.mjs <cmd> [dir] [...args]

commands: collect, resolve-spec, assemble, capture, broll, tts, align-captions,
          beat-sync, seam-gate, render, quality-check, score-frames,
          distribution-copy, distribute, validate, build

See bin/reel.mjs's header comment for each command's exact argv translation.`;

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(USAGE);
  process.exit(cmd ? 0 : 1);
}

switch (cmd) {
  case "collect": {
    // No project-dir concept here (input is a PR ref, not a build dir) — pure
    // pass-through to engine/collect.mjs <ref> [outPath].
    if (!rest.length) {
      console.error("usage: node bin/reel.mjs collect <owner/repo#number> [outPath]");
      process.exit(1);
    }
    runOrExit("node", [engine("collect.mjs"), ...rest]);
    break;
  }

  case "resolve-spec": {
    // resolve-spec.mjs is flag-only (--archetype/--brand/--tokens/--out/...); it has
    // no directory positional of its own. Accept an optional leading dir purely to
    // fill in --tokens/--out defaults, so `reel resolve-spec build --archetype X
    // --brand Y` works without repeating build/ paths in every flag.
    const { dir, rest: flagArgv } = takeDir(rest);
    const args = [...flagArgv];
    if (!args.includes("--tokens") && existsSync(join(dir, "tokens.json"))) {
      args.push("--tokens", join(dir, "tokens.json"));
    }
    if (!args.includes("--out")) {
      args.push("--out", join(dir, "reel-spec.json"));
    }
    runOrExit("node", [engine("resolve-spec.mjs"), ...args]);
    break;
  }

  case "assemble": {
    // engine/assemble.mjs [specPath] [outDir] -- dir is already the 2nd positional
    // there; the dispatcher's job is just to let the dir come first on our CLI.
    const { dir, rest: extra } = takeDir(rest);
    const specPath = extra[0] && !isFlag(extra[0]) ? resolve(extra[0]) : specDefaultFor(dir);
    runOrExit("node", [engine("assemble.mjs"), specPath, dir]);
    break;
  }

  case "capture": {
    // engine/capture.mjs is --spec/--url/--out flag-only. Fill in --out=<dir>/capture
    // and --spec=<dir>/reel-spec.json (if present and neither --spec nor --url was
    // passed explicitly) so the common case is just `reel capture <dir>`.
    const { dir, rest: flagArgv } = takeDir(rest);
    const args = [...flagArgv];
    if (!args.includes("--out")) args.push("--out", join(dir, "capture"));
    if (!args.includes("--spec") && !args.includes("--url") && existsSync(join(dir, "reel-spec.json"))) {
      args.push("--spec", join(dir, "reel-spec.json"));
    }
    runOrExit("node", [engine("capture.mjs"), ...args]);
    break;
  }

  case "broll": {
    // engine/broll.mjs is --spec/--out flag-only.
    const { dir, rest: flagArgv } = takeDir(rest);
    const args = [...flagArgv];
    if (!args.includes("--out")) args.push("--out", join(dir, "broll"));
    if (!args.includes("--spec")) args.push("--spec", specDefaultFor(dir));
    runOrExit("node", [engine("broll.mjs"), ...args]);
    break;
  }

  case "tts": {
    // engine/tts.mjs has two modes: whole-spec ([specPath] [outDir] positionals)
    // or single-line debug (--text ... [--out dir]). Only translate the whole-spec
    // mode into dir-first; the debug mode is already flag-based, pass it through.
    const { dir, rest: extra } = takeDir(rest);
    if (extra.includes("--text")) {
      const args = [...extra];
      if (!args.includes("--out")) args.push("--out", join(dir, "narration"));
      runOrExit("node", [engine("tts.mjs"), ...args]);
    } else {
      const specPath = extra[0] && !isFlag(extra[0]) ? resolve(extra[0]) : specDefaultFor(dir);
      runOrExit("node", [engine("tts.mjs"), specPath, join(dir, "narration")]);
    }
    break;
  }

  case "align-captions": {
    // engine/align-captions.mjs [buildDir] [specPath] -- already dir-first.
    const { dir, rest: extra } = takeDir(rest);
    const args = [dir];
    if (extra[0]) args.push(resolve(extra[0]));
    runOrExit("node", [engine("align-captions.mjs"), ...args]);
    break;
  }

  case "beat-sync": {
    // No project-dir concept — operates on a standalone audio file or --snap-test.
    // Pure pass-through to engine/beat-sync.mjs.
    if (!rest.length) {
      console.error("usage: node bin/reel.mjs beat-sync <audioFile>");
      console.error("   or: node bin/reel.mjs beat-sync --snap-test <bpm>");
      process.exit(1);
    }
    runOrExit("node", [engine("beat-sync.mjs"), ...rest]);
    break;
  }

  case "seam-gate": {
    // engine/seam-gate.mjs takes the assembled HTML FILE, not a dir. This is
    // exactly the inconsistency the roadmap calls out — resolve it here as
    // <dir>/index.html, the file assemble.mjs always writes.
    const { dir } = takeDir(rest);
    runOrExit("node", [engine("seam-gate.mjs"), join(dir, "index.html")]);
    break;
  }

  case "render": {
    // engine/render.mjs [dir] [output] -- already dir-first.
    const { dir, rest: extra } = takeDir(rest);
    const args = [dir];
    if (extra[0]) args.push(resolve(extra[0]));
    runOrExit("node", [engine("render.mjs"), ...args]);
    break;
  }

  case "quality-check": {
    // engine/quality-check.mjs [dir] [mp4] [--scores path] [--auto] -- already dir-first.
    const { dir, rest: extra } = takeDir(rest);
    const args = [dir, ...extra];
    runOrExit("node", [engine("quality-check.mjs"), ...args]);
    break;
  }

  case "score-frames": {
    // engine/score-frames.mjs [framesDir] [--out path] [--max-frames N]. The frames
    // dir is a fixed convention (quality-check.mjs always writes <dir>/quality/frames),
    // so accepting the project dir here and resolving the frames path for the caller
    // is the whole point of this dispatcher.
    const { dir, rest: flagArgv } = takeDir(rest);
    const framesDir = join(dir, "quality", "frames");
    const args = [framesDir, ...flagArgv];
    if (!flagArgv.includes("--out")) args.push("--out", join(dir, "quality", "scores.json"));
    runOrExit("node", [engine("score-frames.mjs"), ...args]);
    break;
  }

  case "distribution-copy": {
    // engine/generate-distribution-copy.mjs [specPath] [tokensPath] [outDir] --
    // all three collapse to one project dir.
    const { dir } = takeDir(rest);
    runOrExit("node", [
      engine("generate-distribution-copy.mjs"),
      join(dir, "reel-spec.json"),
      join(dir, "tokens.json"),
      join(dir, "distribution"),
    ]);
    break;
  }

  case "distribute": {
    // distribute/index.mjs [copyPath] [videoPath] -- both collapse to one project dir.
    const { dir } = takeDir(rest);
    runOrExit("node", [
      join(root, "distribute/index.mjs"),
      join(dir, "distribution", "copy.json"),
      join(dir, "reel.mp4"),
    ]);
    break;
  }

  case "validate": {
    // engine/validate.mjs takes no positional args at all (repo-wide schema gate,
    // not scoped to a build dir) -- pure pass-through.
    runOrExit("node", [engine("validate.mjs"), ...rest]);
    break;
  }

  case "build": {
    // Combined convenience command matching package.json's "build" script, but
    // dir-first and via this same dispatcher: assemble -> seam-gate ->
    // align-captions -> render, all against one project dir.
    const { dir, rest: extra } = takeDir(rest);
    const specPath = extra[0] && !isFlag(extra[0]) ? resolve(extra[0]) : specDefaultFor(dir);
    console.log(`→ reel build ${dir} (spec: ${specPath})`);
    runOrExit("node", [engine("assemble.mjs"), specPath, dir]);
    runOrExit("node", [engine("seam-gate.mjs"), join(dir, "index.html")]);
    runOrExit("node", [engine("align-captions.mjs"), dir]);
    runOrExit("node", [engine("render.mjs"), dir]);
    break;
  }

  default:
    console.error(`unknown command: ${cmd}\n`);
    console.error(USAGE);
    process.exit(1);
}
