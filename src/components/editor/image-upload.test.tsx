// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageUpload } from "./image-upload";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// QA regression: after Upload then Remove without leaving the settings tab,
// the blob preview outlived the cleared field and a thumbnail stayed on.
describe("ImageUpload preview lifecycle", () => {
  it("drops the instant preview once the saved URL arrives and when the image is removed", async () => {
    URL.createObjectURL = vi.fn(() => "blob:qa-image");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://assets.example/og.jpg" }) }),
    );
    const uploaded = vi.fn();
    const view = render(<ImageUpload uploadType="og" currentUrl={null} onUpload={uploaded} />);

    await act(async () =>
      fireEvent.change(view.container.querySelector("input")!, {
        target: { files: [new File(["test"], "og.png", { type: "image/png" })] },
      }),
    );
    expect(uploaded).toHaveBeenCalledWith("https://assets.example/og.jpg");

    view.rerender(<ImageUpload uploadType="og" currentUrl="https://assets.example/og.jpg" onUpload={uploaded} />);
    expect((screen.getByRole("img") as HTMLImageElement).src).toBe("https://assets.example/og.jpg");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-image");

    view.rerender(<ImageUpload uploadType="og" currentUrl={null} onUpload={uploaded} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
