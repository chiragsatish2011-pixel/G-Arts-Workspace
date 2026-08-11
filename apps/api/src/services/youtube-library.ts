import { env } from "../config.js";

const RECENT_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;

type PlaylistItem = {
  snippet?: { title?: string; resourceId?: { videoId?: string } };
  contentDetails?: { videoPublishedAt?: string };
};
type VideoDetail = {
  id?: string;
  snippet?: { title?: string; liveBroadcastContent?: string };
  liveStreamingDetails?: { actualStartTime?: string; scheduledStartTime?: string };
};

export type LatestLibraryItem = { id: string; title: string; url: string; publishedAt: string };
export type LatestLibraryFeed = {
  status: "ready" | "unconfigured" | "unavailable";
  windowDays: 15;
  sourceUrl: string;
  refreshedAt: string;
  video: LatestLibraryItem[];
  live: LatestLibraryItem[];
  message?: string;
};

let cached: { at: number; value: LatestLibraryFeed } | null = null;

function sourceUrl() {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(env.YOUTUBE_BANGALORE_PLAYLIST_ID)}`;
}

/** Pure filtering keeps the fifteen-day promise independently testable. */
export function recentPlaylistItems(items: PlaylistItem[], now = new Date()): LatestLibraryItem[] {
  const earliest = now.getTime() - RECENT_WINDOW_MS;
  return items.flatMap((item) => {
    const id = item.snippet?.resourceId?.videoId;
    const publishedAt = item.contentDetails?.videoPublishedAt;
    const at = publishedAt ? Date.parse(publishedAt) : Number.NaN;
    if (!id || !publishedAt || !Number.isFinite(at) || at < earliest || at > now.getTime()) return [];
    return [{ id, title: item.snippet?.title?.trim() || "Untitled YouTube post", url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, publishedAt }];
  });
}

function empty(status: LatestLibraryFeed["status"], message?: string): LatestLibraryFeed {
  return { status, message, windowDays: 15, sourceUrl: sourceUrl(), refreshedAt: new Date().toISOString(), video: [], live: [] };
}

/**
   * Reads only the public playlist the team supplied. The raw response is never
 * persisted: it is an external reference, not a media upload or copy.
 */
export async function latestBengaluruPosts(): Promise<LatestLibraryFeed> {
  if (!env.YOUTUBE_DATA_API_KEY) return empty("unconfigured", "Automatic posts need the YouTube Data API key to be configured.");
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  try {
    const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    playlistUrl.search = new URLSearchParams({
      part: "snippet,contentDetails", playlistId: env.YOUTUBE_BANGALORE_PLAYLIST_ID, maxResults: "50", key: env.YOUTUBE_DATA_API_KEY,
    }).toString();
    const playlistResponse = await fetch(playlistUrl, { signal: AbortSignal.timeout(15_000) });
    if (!playlistResponse.ok) throw new Error(`YouTube returned ${playlistResponse.status}`);
    const playlist = await playlistResponse.json() as { items?: PlaylistItem[] };
    const recent = recentPlaylistItems(playlist.items ?? []);
    if (recent.length === 0) {
      const value = empty("ready"); cached = { at: Date.now(), value }; return value;
    }

    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.search = new URLSearchParams({
      part: "snippet,liveStreamingDetails", id: recent.map((item) => item.id).join(","), key: env.YOUTUBE_DATA_API_KEY,
    }).toString();
    const detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(15_000) });
    if (!detailsResponse.ok) throw new Error(`YouTube returned ${detailsResponse.status}`);
    const details = await detailsResponse.json() as { items?: VideoDetail[] };
    const byId = new Map((details.items ?? []).flatMap((detail) => detail.id ? [[detail.id, detail] as const] : []));
    const live: LatestLibraryItem[] = [];
    const video: LatestLibraryItem[] = [];
    for (const item of recent) {
      const detail = byId.get(item.id);
      const isLive = Boolean(detail?.liveStreamingDetails?.actualStartTime || detail?.liveStreamingDetails?.scheduledStartTime || (detail?.snippet?.liveBroadcastContent && detail.snippet.liveBroadcastContent !== "none"));
      (isLive ? live : video).push({ ...item, title: detail?.snippet?.title?.trim() || item.title });
    }
    const value: LatestLibraryFeed = { status: "ready", windowDays: 15, sourceUrl: sourceUrl(), refreshedAt: new Date().toISOString(), video, live };
    cached = { at: Date.now(), value };
    return value;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The YouTube source could not be reached";
    return empty("unavailable", `Automatic posts are temporarily unavailable: ${message}`);
  }
}
