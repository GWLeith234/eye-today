import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AMBER,
  BRAND,
  INK,
  MUTED,
  PAPER,
  SECTION_COLORS,
  STORIES,
  contrastRatio,
  inkOnPaper,
  onBand,
  passesAa,
} from "./palette";

test("body, muted, brand and section text clear WCAG AA on paper", () => {
  const text = [INK, MUTED, BRAND, ...Object.values(SECTION_COLORS)];
  for (const color of text) {
    assert.ok(passesAa(color, PAPER), `${color} on paper is ${contrastRatio(color, PAPER).toFixed(2)}`);
  }
});

test("section bands keep paper or white text at AA", () => {
  for (const color of Object.values(SECTION_COLORS)) {
    const foreground = onBand(color);
    assert.ok(passesAa(foreground, color), `${foreground} on ${color} is ${contrastRatio(foreground, color).toFixed(2)}`);
  }
});

test("the support button uses ink on amber, never amber as text", () => {
  assert.ok(passesAa(INK, AMBER), `ink on amber is ${contrastRatio(INK, AMBER).toFixed(2)}`);
  assert.equal(passesAa(AMBER, PAPER), false);
  assert.equal(inkOnPaper(AMBER), INK);
});

test("stories gold is the darkened token", () => {
  assert.equal(STORIES, "#976912");
  assert.equal(SECTION_COLORS.stories, STORIES);
});
