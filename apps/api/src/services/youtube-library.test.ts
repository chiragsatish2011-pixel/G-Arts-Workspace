import { describe, expect, it } from "vitest";
import { recentPlaylistItems } from "./youtube-library.js";

describe("recentPlaylistItems", () => {
  const now = new Date("2026-08-11T12:00:00Z");
  it("keeps only genuine posts from the last fifteen days", () => {
    const result = recentPlaylistItems([
      { snippet: { title: "New post", resourceId: { videoId: "new-id" } }, contentDetails: { videoPublishedAt: "2026-07-27T12:00:00Z" } },
      { snippet: { title: "Too old", resourceId: { videoId: "old-id" } }, contentDetails: { videoPublishedAt: "2026-07-27T11:59:59Z" } },
      { snippet: { title: "Future", resourceId: { videoId: "future-id" } }, contentDetails: { videoPublishedAt: "2026-08-12T12:00:00Z" } },
    ], now);
    expect(result).toEqual([{ id: "new-id", title: "New post", url: "https://www.youtube.com/watch?v=new-id", publishedAt: "2026-07-27T12:00:00Z" }]);
  });
});
