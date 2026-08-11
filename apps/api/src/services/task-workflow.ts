export type WorkStatus = "not_done" | "submitted" | "approved";
export type CompletionKind = "finished" | "not_required" | null;

/** Central rules for the two-person event-work review flow. The route owns
 * persistence; this helper keeps the permission decisions testable. */
export function taskTransitionProblem(input: {
  currentStatus: WorkStatus;
  currentKind: CompletionKind;
  nextStatus: WorkStatus;
  nextKind: CompletionKind;
  isAdmin: boolean;
}): string | null {
  const { currentStatus, currentKind, nextStatus, nextKind, isAdmin } = input;
  if (nextStatus === "approved" && (!isAdmin || currentStatus !== "submitted")) return "An administrator can approve a submitted item after review";
  if (currentKind === "not_required" && !isAdmin) return "Only an administrator can change a not-required decision";
  if (nextKind === "not_required" && !isAdmin) return "Only an administrator can mark work not required";
  if ((nextStatus === "submitted" || nextStatus === "not_done") && currentStatus === "approved" && !isAdmin) return "Only an administrator can reopen an approved item";
  return null;
}
