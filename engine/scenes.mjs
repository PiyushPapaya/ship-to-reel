// engine/scenes.mjs — deterministic scene generators.
// Each generator maps a typed beat.slot to the inner HTML of a full-bleed scene.
// Elements that should animate in carry class="anim"; assemble.mjs attaches a
// uniform entrance tween to them. Generators emit markup only — no timing, no
// randomness — so the same spec always yields the same bytes.

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// --- per-type generators ------------------------------------------------------

function hook(slot) {
  return `
      <div class="stage">
        <p class="eyebrow anim">Hook</p>
        <h1 class="headline anim">${esc(slot.line ?? slot.title ?? "")}</h1>
      </div>`;
}

function problem(slot) {
  return `
      <div class="stage">
        <p class="eyebrow anim">The problem</p>
        <h1 class="headline anim">${esc(slot.title ?? "")}</h1>
        ${slot.body ? `<p class="body anim">${esc(slot.body)}</p>` : ""}
      </div>`;
}

function codeDiff(slot) {
  const file = slot.file ? `<span class="file">${esc(slot.file)}</span>` : "";
  const del = slot.removed ? `<span class="del">- ${esc(slot.removed)}</span>` : "";
  const add = slot.added ? `<span class="add">+ ${esc(slot.added)}</span>` : "";
  return `
      <div class="stage">
        <p class="eyebrow anim">The fix</p>
        <div class="card anim">
          <div class="code">${file}${del}${add}</div>
        </div>
      </div>`;
}

function result(slot) {
  return `
      <div class="stage">
        <p class="eyebrow anim">Result</p>
        <p class="metric anim">${esc(slot.metric ?? "")}</p>
        ${slot.sub ? `<p class="body anim">${esc(slot.sub)}</p>` : ""}
      </div>`;
}

function outro(slot, ctx) {
  const handle = esc(slot.handle ?? ctx.channel.handle ?? "");
  return `
      <div class="stage">
        <div class="outro">
          ${handle ? `<p class="handle anim">${handle}</p>` : ""}
          <p class="body anim">${esc(slot.line ?? "Follow for more.")}</p>
        </div>
      </div>`;
}

// Generic fallback for any beat type without a dedicated generator
// (context, feature, flow, metric, comparison, quote, cta, …).
function generic(type) {
  return (slot) => {
    const items = Array.isArray(slot.items)
      ? slot.items.map((i) => `<p class="body anim">${esc(i)}</p>`).join("\n        ")
      : "";
    return `
      <div class="stage">
        <p class="eyebrow anim">${esc(type)}</p>
        ${slot.title ? `<h1 class="headline anim">${esc(slot.title)}</h1>` : ""}
        ${slot.body ? `<p class="body anim">${esc(slot.body)}</p>` : ""}
        ${items}
      </div>`;
  };
}

const REGISTRY = {
  hook,
  problem,
  "code-diff": codeDiff,
  result,
  outro,
};

export function renderScene(beat, ctx) {
  const gen = REGISTRY[beat.type] ?? generic(beat.type);
  return gen(beat.slot ?? {}, ctx).trim();
}

export const SCENE_TYPES = Object.keys(REGISTRY);
