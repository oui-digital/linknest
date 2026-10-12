/** Offline, manual capture: no dev server, env file, database, or app services. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import sharp from "sharp";
import { ExamplePage } from "../src/components/marketing/example-page";
import { TEMPLATES } from "../src/lib/templates";

async function main() {
  const root = process.cwd();
  const cssPath = path.join(root, "src/app/globals.css");
  const css = (await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), { from: cssPath })).css;
  const output = path.join(root, "public/marketing/templates");
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const template of TEMPLATES) {
      const markup = renderToStaticMarkup(<ExamplePage kind="multi" templateId={template.id} />);
      const page = await browser.newPage({ viewport: { width: 420, height: 700 }, deviceScaleFactor: 2 });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ fullPage: true });
      const webp = await sharp(png).resize(640, 470, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
      const dest = path.join(output, `${template.id}.webp`);
      await writeFile(dest, webp);
      console.log(`${template.id}: ${webp.length} bytes`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
