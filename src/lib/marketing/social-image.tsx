import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };

async function fontData(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(path.join(process.cwd(), "src/assets/marketing-fonts", name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function marketingSocialImage(title: string, eyebrow: string) {
  const [sans, serif] = await Promise.all([fontData("DMSans-Bold.ttf"), fontData("DMSerifDisplay-Regular.ttf")]);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#1A1A2E", color: "white", padding: "68px 76px", position: "relative" }}>
      <div style={{ position: "absolute", width: 360, height: 360, right: -100, top: -100, borderRadius: "50%", border: "55px solid #E8614D", opacity: 0.8 }} />
      <div style={{ display: "flex", alignItems: "center", fontFamily: "DMSans", fontSize: 29, zIndex: 1 }}><span style={{ width: 27, height: 27, borderRadius: "50%", background: "#E8614D", marginRight: 14 }} />LinkNest</div>
      <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
        <span style={{ fontFamily: "DMSans", color: "#E8614D", fontSize: 23, textTransform: "uppercase", letterSpacing: 2 }}>{eyebrow}</span>
        <span style={{ fontFamily: "DMSerif", fontSize: 65, lineHeight: 1.08, maxWidth: 940, marginTop: 22 }}>{title}</span>
      </div>
      <div style={{ fontFamily: "DMSans", fontSize: 21, color: "#D4D0CC", zIndex: 1 }}>linknest.click</div>
    </div>,
    { ...SOCIAL_IMAGE_SIZE, fonts: [{ name: "DMSans", data: sans, weight: 700 }, { name: "DMSerif", data: serif, weight: 400 }] },
  );
}
