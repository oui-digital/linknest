/**
 * Languages a page can declare.
 *
 * The value becomes `<html lang>` on the public page, so it is a closed list
 * of BCP-47 tags rather than free text: it reaches an attribute, and screen
 * readers switch voices on it. A French page served as `lang="en"` is read
 * with English pronunciation and fails the WCAG language-of-page criterion.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "nb", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "pl", label: "Polski" },
  { code: "cs", label: "Čeština" },
  { code: "tr", label: "Türkçe" },
  { code: "ro", label: "Română" },
  { code: "hu", label: "Magyar" },
  { code: "el", label: "Ελληνικά" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh-Hans", label: "中文（简体）" },
  { code: "zh-Hant", label: "中文（繁體）" },
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "hi", label: "हिन्दी" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ไทย" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

const RTL = new Set<string>(["ar", "he"]);

/** Right-to-left scripts: the page and its preview get `dir="rtl"`. */
export function isRtl(code: string): boolean {
  return RTL.has(code.split("-")[0]);
}

/** The stored value, or the default when it is unknown (an old row). */
export function pageLanguage(code: string | null | undefined): LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(code ?? "")
    ? (code as LanguageCode)
    : DEFAULT_LANGUAGE;
}
