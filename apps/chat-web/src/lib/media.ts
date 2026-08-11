import { getAccessToken } from './api';

/**
 * Attachments and profile pictures are served from an authenticated endpoint,
 * so they cannot be dropped straight into an `img src`. Each id is fetched
 * once with the bearer token and held as an object URL for the life of the
 * page.
 */
const cache = new Map<string, Promise<string>>();

export function mediaUrl(attachmentId: string): Promise<string> {
  let promise = cache.get(attachmentId);
  if (!promise) {
    promise = fetch(`/api/files/${attachmentId}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Could not load file');
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    cache.set(attachmentId, promise);
  }
  return promise;
}

/** Called after a new upload replaces an id, so the stale blob is not reused. */
export function forgetMedia(attachmentId: string): void {
  const existing = cache.get(attachmentId);
  cache.delete(attachmentId);
  void existing?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
}

/** Ids are cuids; anything with a scheme is already a usable URL. */
export function isAttachmentId(value: string | null | undefined): value is string {
  return Boolean(value) && !/^(https?:|data:|blob:|\/)/.test(value!);
}
