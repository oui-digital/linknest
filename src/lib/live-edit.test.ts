import { describe, it, expect } from "vitest";
import { urlsIntroducedByUpdate } from "./live-edit";

const OLD = "https://old.example/";
const NEW = "https://new.example/";
const visible = (urls: string[]) => ({ urls, isVisible: true });
const hidden = (urls: string[]) => ({ urls, isVisible: false });

describe("urlsIntroducedByUpdate", () => {
  it("scans a replaced link on a visible block", () => {
    expect(urlsIntroducedByUpdate(visible([OLD]), visible([NEW]))).toEqual([NEW]);
  });

  it("scans every destination when a hidden block is shown", () => {
    const two = "https://two.example/";
    expect(urlsIntroducedByUpdate(hidden([OLD, two]), visible([OLD, two]))).toEqual([OLD, two]);
  });

  it("scans the new link when a block is changed and shown at once", () => {
    expect(urlsIntroducedByUpdate(hidden([OLD]), visible([NEW]))).toEqual([NEW]);
  });

  it("defers a link changed on a hidden block until it is shown", () => {
    expect(urlsIntroducedByUpdate(hidden([OLD]), hidden([NEW]))).toEqual([]);
  });

  it("ignores label-only edits, hiding, and clearing the URL", () => {
    expect(urlsIntroducedByUpdate(visible([OLD]), visible([OLD]))).toEqual([]);
    expect(urlsIntroducedByUpdate(visible([OLD]), hidden([OLD]))).toEqual([]);
    expect(urlsIntroducedByUpdate(visible([OLD]), visible([]))).toEqual([]);
  });

  // Content-carried destinations (social icons, embeds) arrive as extra URLs
  // on the same block: only the additions are new to visitors.
  it("scans only the destinations a visible block did not have before", () => {
    expect(urlsIntroducedByUpdate(visible([OLD]), visible([OLD, NEW]))).toEqual([NEW]);
  });

  it("dedupes and drops empty values", () => {
    expect(urlsIntroducedByUpdate(visible([]), visible([NEW, NEW, ""]))).toEqual([NEW]);
  });
});
