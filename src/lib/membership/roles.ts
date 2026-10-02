// The role rules, in one pure function. The webhook checks the database against it after every
// sync, the tests state the rules through it, and public.sync_supporter_role() (0009) says the same:
//   reader    + an active membership, or a past_due one still inside its period -> supporter
//   supporter + no such membership                                              -> reader
//   contributor, editor and admin never change.
// No server-only import: the tests load this file.

export type Role = "reader" | "supporter" | "contributor" | "editor" | "admin";
export type MembershipStatus = "active" | "past_due" | "canceled" | "expired";
export type MembershipLike = { status: MembershipStatus; current_period_end: string | Date | null };

export function grantsSupporter(membership: MembershipLike, now: Date = new Date()): boolean {
  if (membership.status === "active") return true;
  if (membership.status !== "past_due") return false;
  return membership.current_period_end === null || new Date(membership.current_period_end).getTime() > now.getTime();
}

export function nextRole(role: Role, memberships: readonly MembershipLike[], now: Date = new Date()): Role {
  const supporter = memberships.some((m) => grantsSupporter(m, now));
  if (role === "reader" && supporter) return "supporter";
  if (role === "supporter" && !supporter) return "reader";
  return role;
}
