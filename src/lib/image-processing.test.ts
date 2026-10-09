import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { processImage } from "./image-processing";

// Create a simple 100x200 red PNG buffer for testing
async function createTestImage(width = 100, height = 200): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

describe("processImage", () => {
  it("avatar type: crops to 512x512 WebP", async () => {
    const input = await createTestImage(800, 1200);
    const output = await processImage(input, "avatar");

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(meta.format).toBe("webp");
  });

  it("thumbnail type: crops to 160x160 WebP", async () => {
    const input = await createTestImage(1600, 900);
    const output = await processImage(input, "thumbnail");

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(160);
    expect(meta.height).toBe(160);
    expect(meta.format).toBe("webp");
  });

  it("default type: resizes to max 1200px width, WebP", async () => {
    const input = await createTestImage(2400, 1600);
    const output = await processImage(input);

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.format).toBe("webp");
  });

  it("default type: does not enlarge small images", async () => {
    const input = await createTestImage(400, 300);
    const output = await processImage(input);

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(400);
    expect(meta.format).toBe("webp");
  });
});
