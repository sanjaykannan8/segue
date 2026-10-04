/**
 * Segue: the few fixed screen-reader strings inside Arc components, so the app can translate them.
 * The i18n provider assigns these; the defaults are Arc's own English wording.
 */
export const arcLabels = {
  closeDialog: "Close dialog",
  dismissToast: "Dismiss notification",
  stepCompleted: "Completed",
  stepUpcoming: "Not started",
  stepError: "Error",
  stepPosition: (n: number, count: number, label: string): string => `Step ${n} of ${count}: ${label}`,
};
