/**
 * Event categories.
 *
 * Categories are labels selected by a person. They do not imply work, coverage,
 * work-items or a category for a calendar entry.
 */

export interface Category {
  key: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { key: "unclassified", label: "To be classified" },
  { key: "spiritual", label: "Spiritual" },
  { key: "sports", label: "Sports" },
  { key: "cultural", label: "Cultural" },
  { key: "academic", label: "Academic" },
  { key: "leadership", label: "Leadership" },
  { key: "trip", label: "Trip" },
  { key: "campus", label: "Campus life" },
];

const BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));

export const isCategory = (key: string) => BY_KEY.has(key);
export function parseCoverage(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
