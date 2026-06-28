/**
 * Pure, ctx-free employee helpers. Unit-testable; no Convex imports.
 */

export function buildSearchName(p: {
  firstName: string;
  lastName: string;
  preferredName?: string;
  employeeNumber: string;
}): string {
  return [p.firstName, p.lastName, p.preferredName ?? "", p.employeeNumber]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
}

export function fullName(p: {
  firstName: string;
  lastName: string;
  preferredName?: string;
}): string {
  const base = `${p.firstName} ${p.lastName}`.trim();
  return p.preferredName ? `${p.preferredName} (${base})` : base;
}
