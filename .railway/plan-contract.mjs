/**
 * Fail-closed contract for an in-place staging adoption.
 *
 * `backend` and `frontend` already exist in nxq-social-staging. A Railway
 * IaC apply is allowed to create only the isolated one-shot migration job;
 * replacing either application service is rejected before Railway can prompt
 * to apply.
 */
export const EXISTING_STAGING_SERVICE_PLAN = Object.freeze({
  summary: "Plan: 1 to add, 2 to change, 0 to destroy",
  creates: ["+ Create service migration-job"],
  changes: ["~ Update service backend", "~ Update service frontend"],
});

export function assertExistingStagingServicePlan(planOutput) {
  if (typeof planOutput !== "string" || planOutput.trim() === "") {
    throw new Error("Railway did not return a staging plan.");
  }

  const lines = planOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summaryLines = lines.filter((line) => line.startsWith("Plan:"));
  const actionLines = lines.filter((line) => /^[+~-] /.test(line));

  if (
    summaryLines.length !== 1 ||
    summaryLines[0] !== EXISTING_STAGING_SERVICE_PLAN.summary
  ) {
    throw new Error(
      "Refusing to apply because the plan is not the reviewed in-place staging adoption.",
    );
  }

  const expectedActions = [
    ...EXISTING_STAGING_SERVICE_PLAN.creates,
    ...EXISTING_STAGING_SERVICE_PLAN.changes,
  ].sort();
  if (JSON.stringify(actionLines.sort()) !== JSON.stringify(expectedActions)) {
    throw new Error(
      "Refusing to apply because the plan creates, changes, or destroys an unreviewed Railway resource.",
    );
  }
}
