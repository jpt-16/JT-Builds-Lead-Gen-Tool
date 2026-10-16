import { describe, expect, it, vi } from "vitest";
import { isAuthorizedCron } from "./cron";
import { DailyLimitError, reservePlacesRequest } from "./places-usage";

describe("isAuthorizedCron", () => {
  it("accepts exactly 'Bearer <secret>'", () => {
    expect(isAuthorizedCron("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });

  it.each([
    ["no header", null, "s3cret-value"],
    ["wrong secret", "Bearer nope", "s3cret-value"],
    ["missing Bearer", "s3cret-value", "s3cret-value"],
    ["extra whitespace", "Bearer  s3cret-value", "s3cret-value"],
    ["different case", "bearer s3cret-value", "s3cret-value"],
    ["secret not configured", "Bearer undefined", undefined],
    ["empty secret", "Bearer ", ""],
    ["secret as prefix", "Bearer s3cret-value-and-more", "s3cret-value"],
  ])("refuses %s", (_label, header, secret) => {
    expect(isAuthorizedCron(header, secret)).toBe(false);
  });
});

describe("reservePlacesRequest", () => {
  const client = (rows: { allowed: boolean; used: number }[]) => {
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    return { rpc, supabase: { rpc } as never };
  };

  it("reserves as the signed-in user by default", async () => {
    const { rpc, supabase } = client([{ allowed: true, used: 4 }]);
    expect(await reservePlacesRequest(supabase, 30)).toEqual({ used: 4, limit: 30 });
    expect(rpc).toHaveBeenCalledWith("reserve_places_requests", { requested: 1, daily_limit: 30 });
  });

  it("reserves for a named owner when the cron job asks", async () => {
    const { rpc, supabase } = client([{ allowed: true, used: 1 }]);
    await reservePlacesRequest(supabase, 30, "owner-id-1");
    expect(rpc).toHaveBeenCalledWith("reserve_places_requests_for", { owner: "owner-id-1", requested: 1, daily_limit: 30 });
  });

  it("stops with DailyLimitError when the day's limit is used up", async () => {
    const { supabase } = client([{ allowed: false, used: 30 }]);
    await expect(reservePlacesRequest(supabase, 30, "owner-id-1")).rejects.toBeInstanceOf(DailyLimitError);
  });
});
