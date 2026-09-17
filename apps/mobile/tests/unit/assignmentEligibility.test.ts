import { canAssignTask } from "../../src/features/tasks/assignmentEligibility";

describe("canAssignTask", () => {
  it.each(["TODO", "IN_PROGRESS"] as const)("allows an active task (%s)", (status) => {
    expect(canAssignTask(status)).toBe(true);
  });

  it.each(["DONE", "CANCELLED"] as const)("rejects a finished/terminal task (%s)", (status) => {
    expect(canAssignTask(status)).toBe(false);
  });
});
