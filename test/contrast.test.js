import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// WCAG 2.1 AA contrast guard for the colour tokens in src/styles.css.
// The audience is children, so text has to stay legible: normal text needs
// 4.5:1, large text (>=18.66px bold / 24px) and graphical elements 3:1.
// Tokens are read out of the stylesheet so a palette edit fails here rather
// than silently regressing the app.

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

/** Pull a `--name:#hex` custom property out of the `:root` block. */
function token(name) {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
  assert.ok(m, `token --${name} not found in src/styles.css`);
  return m[1];
}

const channels = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

const T = {
  cream: token("cream"), paper: token("paper"), ink: token("ink"), muted: token("muted"),
  gingerText: token("ginger-text"), gingerDeep: token("ginger-deep"),
  mintSoft: token("mint-soft"), coralSoft: token("coral-soft"),
  skySoft: token("sky-soft"), skyText: token("sky-text"),
  purple: token("purple"), purpleDeep: token("purple-deep"), purpleSoft: token("purple-soft"),
  sunny: token("sunny"), bad: token("bad"), badText: token("bad-text"),
};

// [label, foreground, background] — text that must clear 4.5:1.
const NORMAL_TEXT = [
  [".greet p / .sectitle / .note — muted on cream", T.muted, T.cream],
  [".stat span / .badge .bd / .ws .ans — muted on paper", T.muted, T.paper],
  [".linkbtn — muted underline link on cream", T.muted, T.cream],
  [".streak — ginger-text on paper", T.gingerText, T.paper],
  [".step / .spk / .trackbadge.teacher — sky-text on sky-soft", T.skyText, T.skySoft],
  [".pill / .codechip — purple-deep on purple-soft", T.purpleDeep, T.purpleSoft],
  [".qchip / .consent a — purple-deep on paper", T.purpleDeep, T.paper],
  [".err — bad-text on cream", T.badText, T.cream],
  [".err — bad-text on paper", T.badText, T.paper],
  [".feedback.ok / .ans — on mint-soft", "#0f7a4f", T.mintSoft],
  [".feedback.no / .trackbadge.parent — on coral-soft", "#b3271e", T.coralSoft],
  [".motiv / .bubble / .guidebubble — on paper", "#5a463c", T.paper],
  [".chip.flame — streak flame on paper", "#c1440e", T.paper],
  [".lstars — leaderboard stars on paper", "#8a6218", T.paper],
  [".plan .ribbon — on sunny", "#5a431a", T.sunny],
  [".offlinebar — on its amber background", "#7a5d12", "#fff3cd"],
  [".trialbar — on paper", "#0f7a68", T.paper],
  ["body — ink on cream", T.ink, T.cream],
  [".card — ink on paper", T.ink, T.paper],
  [".reporttext — ink on its warm background", T.ink, "#fff7ec"],
];

// Large text (>=18.66px bold) and graphical elements: 3:1 is enough.
const LARGE_OR_GRAPHICAL = [
  [".cert .who — purple-deep on the certificate", T.purpleDeep, T.paper],
  [".cert .stats b — ginger-text on the certificate", T.gingerText, T.paper],
  ["icon colour on sky-soft tiles", "#2b80d6", T.skySoft],
  [":focus-visible outline against paper", "#2b80d6", T.paper],
  [".choice.wrong border — bad against paper", T.bad, T.paper],
];

test("normal-size text clears WCAG AA (4.5:1)", () => {
  for (const [label, fg, bg] of NORMAL_TEXT) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
  }
});

test("large text and graphical elements clear WCAG AA (3:1)", () => {
  for (const [label, fg, bg] of LARGE_OR_GRAPHICAL) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 3, `${label}: ${ratio.toFixed(2)}:1 (needs 3:1)`);
  }
});

test("brand tokens keep a text-safe variant alongside the fill colour", () => {
  // The bright brand colours are for fills/borders/icons; text must use the
  // --*-text variant, which has to be strictly darker to be worth having.
  for (const [fill, text] of [[T.gingerDeep, T.gingerText], [T.purple, T.purpleDeep], [T.bad, T.badText]]) {
    assert.ok(luminance(text) < luminance(fill), `${text} should be darker than ${fill}`);
  }
});
