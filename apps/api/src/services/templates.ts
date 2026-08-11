/** Project metadata. Projects and tasks are entered by G Arts; no workflow is
 * generated from an event category or its required work. */

export const PROJECT_TYPES = [
  "photo", "video", "shorts", "graphics", "website", "live", "archive",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const STAGES = [
  "planned", "capture", "ready_for_edit", "editing", "review", "approved", "published", "archived",
] as const;
export type Stage = (typeof STAGES)[number];

export const TASK_STATUSES = ["not_done", "submitted", "approved"] as const;
