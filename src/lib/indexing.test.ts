import { describe, it, expect } from "vitest";
import {
  INDEX_PROBATION_DAYS,
  indexProbationCutoff,
  isInIndexProbation,
} from "./indexing";

const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

describe("isInIndexProbation", () => {
  it("holds a freshly published free page back from search", () => {
    expect(isInIndexProbation({ plan: "free", firstPublishedAt: daysAgo(0), now })).toBe(true);
    expect(isInIndexProbation({ plan: "free", firstPublishedAt: daysAgo(13), now })).toBe(true);
  });

  it("releases a free page once the window has passed", () => {
    expect(isInIndexProbation({ plan: "free", firstPublishedAt: daysAgo(15), now })).toBe(false);
  });

  it("is exclusive at exactly the boundary", () => {
    expect(
      isInIndexProbation({ plan: "free", firstPublishedAt: daysAgo(INDEX_PROBATION_DAYS), now }),
    ).toBe(false);
  });

  it("never applies to Pro pages", () => {
    expect(isInIndexProbation({ plan: "pro", firstPublishedAt: daysAgo(0), now })).toBe(false);
    expect(isInIndexProbation({ plan: "pro", firstPublishedAt: null, now })).toBe(false);
  });

  it("treats a page with no first-publish date as new", () => {
    expect(isInIndexProbation({ plan: "free", firstPublishedAt: null, now })).toBe(true);
  });

  it("accepts the ISO string a cached page row carries", () => {
    expect(
      isInIndexProbation({ plan: "free", firstPublishedAt: daysAgo(1).toISOString(), now }),
    ).toBe(true);
    expect(
      isInIndexProbation({ plan: "free", firstPublishedAt: daysAgo(30).toISOString(), now }),
    ).toBe(false);
  });

  it("does not index a page whose date cannot be parsed", () => {
    expect(isInIndexProbation({ plan: "free", firstPublishedAt: "not a date", now })).toBe(true);
  });

  it("treats unknown plan values like free", () => {
    expect(isInIndexProbation({ plan: "trial", firstPublishedAt: daysAgo(1), now })).toBe(true);
  });
});

describe("indexProbationCutoff", () => {
  it("is exactly the probation window before now", () => {
    expect(indexProbationCutoff(now).toISOString()).toBe(daysAgo(INDEX_PROBATION_DAYS).toISOString());
  });
});
