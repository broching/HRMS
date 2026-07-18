// Pure mapping from a notification `type` (and optional entityRef) to the
// feature it belongs to, the in-app route that best resolves it, and a CTA
// label for the email button. Kept side-effect free so both the email builder
// (server) and any UI can share it. The route strings mirror the client-side
// `hrefFor` map in components/layout/notification-center.tsx.

export type EmailFeature =
  | "claims"
  | "paymentRequests"
  | "payroll"
  | "leave"
  | "performance";

export const EMAIL_FEATURES: EmailFeature[] = [
  "claims",
  "paymentRequests",
  "payroll",
  "leave",
  "performance",
];

/** The feature a notification type belongs to, or null if it isn't emailable. */
export function featureForType(type: string): EmailFeature | null {
  if (type.startsWith("claim.")) return "claims";
  if (type.startsWith("payment_request.")) return "paymentRequests";
  if (type.startsWith("payroll.")) return "payroll";
  if (type.startsWith("leave.")) return "leave";
  if (type.startsWith("review.")) return "performance";
  return null;
}

export type EntityRef = { table: string; id: string };

/** Deep link straight to the entity a notification is about, when that entity
 * has its own detail route. Returns null to fall back to the feature landing. */
export function deepLinkForEntity(ref: EntityRef | undefined): string | null {
  if (!ref) return null;
  switch (ref.table) {
    // The appraisal form — the same page serves the employee's self-review and
    // the appraiser's input, gated per side.
    case "reviews":
      return `/performance/reviews/${ref.id}`;
    // A single claim's detail (requester + approver both land here).
    case "claims":
      return `/claims/${ref.id}`;
    // A task notification — id is "projectId:taskId"; open the project workspace
    // and deep-link the task's detail panel via the `?task=` query param.
    case "projectTasks": {
      const [projectId, taskId] = ref.id.split(":");
      if (projectId && taskId) return `/projects/${projectId}?task=${taskId}`;
      return null;
    }
    default:
      return null;
  }
}

/** The relative app path a notification (and its CTA button) should open.
 * Prefers a deep link to the specific entity, falling back to the feature page
 * the event belongs to. */
export function routeForNotification(type: string, entityRef?: EntityRef): string {
  const deep = deepLinkForEntity(entityRef);
  if (deep) return deep;

  // Payroll
  if (type === "payroll.payslip_released" || type === "payroll.release_run")
    return "/payslips";
  if (type.startsWith("payroll.approval") || type === "payroll.complete_run")
    return "/payroll/approvals";
  if (type.startsWith("payroll.")) return "/payslips";

  // Claims — approver-facing events (a claim submitted into someone's queue)
  // open the Team → Claim Approvals surface; the rest open the requester's own
  // claims.
  if (type === "claim.submitted") return "/claims/requests";
  if (type.startsWith("claim.")) return "/claims";

  // Payment requests — a submission awaiting a decision opens the Team → Payment
  // Requests approval queue; requester-facing events (progressed/approved/
  // rejected/paid) open the requester's own list.
  if (type === "payment_request.submitted") return "/payment-requests/requests";
  if (type.startsWith("payment_request.")) return "/payment-requests";

  // Leave — approver-facing events open the Team → Leave approvals; the rest
  // (approved/rejected/info requested back to the employee) open the employee's
  // own leave.
  if (
    type === "leave.requested" ||
    type === "leave.nudge" ||
    type === "leave.resubmitted"
  )
    return "/leave/requests";
  if (type.startsWith("leave.")) return "/leave";

  // Performance — appraiser-facing events open the Team performance surface; the
  // rest (self-appraisal opened/reminder/completed) open the employee's own page.
  if (type === "review.self_submitted" || type === "review.appraiser_reminder")
    return "/performance/team";
  if (type.startsWith("review.")) return "/performance";

  return "/dashboard";
}

/** A human CTA label for the email button, chosen from the event semantics. */
export function ctaLabelForType(type: string): string {
  if (type === "payroll.payslip_released" || type === "payroll.release_run")
    return "View payslip";
  if (type === "review.completed") return "View appraisal";
  if (type.startsWith("review.")) return "Complete appraisal";
  if (
    type.includes("approve") ||
    type.includes("approval") ||
    type.includes("requested") ||
    type.includes("submitted") ||
    type.includes("progressed") ||
    type === "leave.nudge"
  )
    return "Review & approve";
  if (type.includes("rejected")) return "View details";
  if (type.includes("reimbursed") || type.includes("paid")) return "View details";
  return "Open in app";
}
