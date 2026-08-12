/**
 * Resolves a display name using an optional i18n key.
 * If `nameKey` is set and a translation exists, the translated text is returned.
 * Otherwise, the raw `name` field from the database is returned as fallback.
 *
 * Used for entities like KanbanColumn and WorkType that have system defaults
 * seeded in Turkish but should display in the user's chosen language.
 */
export function resolveName(
  t: (key: string) => string,
  name: string,
  nameKey?: string | null,
): string {
  if (!nameKey) return name
  const translated = t(nameKey)
  // If t() returns the key itself (missing translation), fall back to raw name
  return translated === nameKey ? name : translated
}
