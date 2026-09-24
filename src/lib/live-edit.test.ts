import { describe, it, expect } from "vitest";
import { urlsIntroducedByUpdate } from "./live-edit";

const visible = { url: "https://old.example/", isVisible: true };
const hidden = { url: "https://old.example/", isVisible: false };

describe("urlsIntroducedByUpdate", () => {
  it("scans a replaced link on a visible block", () => {
    expect(urlsIntroducedByUpdate(visible, { url: "https://new.example/" })).toEqual([
      "https://new.example/",
    ]);
  });

  it("scans an existing link when a hidden block is shown", () => {
    expect(urlsIntroducedByUpdate(hidden, { isVisible: true })).toEqual([
      "https://old.example/",
    ]);
  });

  it("scans the new link when a block is changed and shown at once", () => {
    expect(
      urlsIntroducedByUpdate(hidden, { url: "https://new.example/", isVisible: true }),
    ).toEqual(["https://new.example/"]);
  });

  it("defers a link changed on a hidden block until it is shown", () => {
    expect(urlsIntroducedByUpdate(hidden, { url: "https://new.example/" })).toEqual([]);
  });

  it("ignores label-only edits, hiding, and clearing the URL", () => {
    expect(urlsIntroducedByUpdate(visible, {})).toEqual([]);
    expect(urlsIntroducedByUpdate(visible, { isVisible: false })).toEqual([]);
    expect(urlsIntroducedByUpdate(visible, { url: null })).toEqual([]);
  });

  it("does not rescan an unchanged URL on a visible block", () => {
    expect(urlsIntroducedByUpdate(visible, { url: "https://old.example/" })).toEqual([]);
  });
});
