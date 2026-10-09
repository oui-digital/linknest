import { describe, it, expect } from "vitest";
import { isTrackableActivation } from "./page-beacon";

describe("isTrackableActivation", () => {
  it("counts left clicks and keyboard activation on links and buttons", () => {
    expect(isTrackableActivation({ type: "click", button: 0, isAnchor: true })).toBe(true);
    expect(isTrackableActivation({ type: "click", button: 0, isAnchor: false })).toBe(true);
  });

  it("counts a middle click only on a link, which opens it in a new tab", () => {
    expect(isTrackableActivation({ type: "auxclick", button: 1, isAnchor: true })).toBe(true);
    // Regression: middle-clicking an embed's play button recorded a play.
    expect(isTrackableActivation({ type: "auxclick", button: 1, isAnchor: false })).toBe(false);
  });

  it("never counts a right click", () => {
    expect(isTrackableActivation({ type: "auxclick", button: 2, isAnchor: true })).toBe(false);
  });
});
