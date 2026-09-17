import { QueryClient } from "@tanstack/react-query";
import { clearSessionCache } from "../../src/features/auth/clearSessionCache";

// M12, Phase 15: regression test for a release-blocking privacy bug —
// Account B must never see Account A's cached server data after switching
// accounts on the same device. Before this fix, logout only removed the
// "me" query, leaving Tasks/Today/Schedule/Inbox/Sent/search results cached
// and immediately visible (stale-while-revalidate) to whoever logs in next.
describe("clearSessionCache", () => {
  it("removes every cached query, not just a subset", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["me"], { id: "user-a", name: "Account A" });
    queryClient.setQueryData(["tasks", "list", null, null, null, null], [{ id: "task-1" }]);
    queryClient.setQueryData(["tasks", "today", "2026-01-01", "2026-01-02"], {
      overdue: [],
      scheduledToday: [{ id: "task-1" }],
      dueToday: [],
    });
    queryClient.setQueryData(["inbox"], [{ id: "assignment-1" }]);
    queryClient.setQueryData(["sentAssignments"], [{ id: "assignment-2" }]);
    queryClient.setQueryData(["users", "search", "rami"], [{ id: "user-b" }]);

    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    clearSessionCache(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    expect(queryClient.getQueryData(["tasks", "list", null, null, null, null])).toBeUndefined();
    expect(queryClient.getQueryData(["inbox"])).toBeUndefined();
    expect(queryClient.getQueryData(["sentAssignments"])).toBeUndefined();
    expect(queryClient.getQueryData(["users", "search", "rami"])).toBeUndefined();
  });

  it("leaves a freshly cleared client able to cache a new account's data afterward", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["me"], { id: "user-a" });

    clearSessionCache(queryClient);
    queryClient.setQueryData(["me"], { id: "user-b" });

    expect(queryClient.getQueryData(["me"])).toEqual({ id: "user-b" });
  });
});
