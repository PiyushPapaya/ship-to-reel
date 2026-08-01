// distribute/lib.mjs — shared env-gate helper for the per-platform posting scripts.
// Every platform module checks its own required env vars first and returns a
// clean "skipped" result if any are missing, instead of throwing — same
// degrade-to-warning pattern as reel.yml's Slack notify step (Phase 5), so a
// dev machine or CI run with no distribution credentials configured never fails
// the pipeline. See distribute/README.md for what each var needs to be.

export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  return { ok: missing.length === 0, missing };
}

export function skipped(platform, missing) {
  console.log(`⏭  ${platform}: not configured (missing ${missing.join(", ")}) — skipping. See distribute/README.md.`);
  return { platform, status: "skipped", missing };
}

export function posted(platform, detail) {
  console.log(`✓ ${platform}: posted${detail ? ` (${detail})` : ""}`);
  return { platform, status: "posted", detail };
}
