/** Converts the two supported application languages into explicit Intl locales. */
export function appLocale(language: string): "uk-UA" | "cs-CZ" {
  return language.startsWith("cs") ? "cs-CZ" : "uk-UA";
}
