import { env } from "../config.js";

/**
 * The Workspace's side of the link to chat.
 *
 * The Workspace is the identity authority: it issues every account and every
 * session. Chat mirrors those members so it can attribute messages, which
 * means a change of identity here has to reach there — otherwise someone whose
 * account was deleted still appears, and still holds a live chat session.
 */

export class ChatLinkError extends Error {}

interface Removal {
  removed: boolean;
  erased: boolean;
  privateChatsDeleted?: number;
  reason?: string;
}

export type ChatMember = { id: string; username: string; displayName: string; role: string; title?: string | null; accentColor?: string | null };

/** Mirrors Workspace-issued accounts into Chat so the real member list is
 * immediately usable there. Chat receives no passwords and cannot write back. */
export async function syncMembersToChat(members: ChatMember[]) {
  if (members.length === 0) return { mirrored: 0 };
  const url = `${env.CHAT_API_URL.replace(/\/$/, "")}/api/integration/members`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { authorization: `Bearer ${env.CHAT_SERVICE_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ members: members.map((member) => ({ workspaceUserId: member.id, username: member.username, displayName: member.displayName, role: member.role, title: member.title ?? null, accentColor: member.accentColor ?? null })) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ChatLinkError("The chat service could not be reached, so member accounts were not mirrored."); }
  if (!response.ok) throw new ChatLinkError(`Chat could not mirror the member list (${response.status}).`);
  return (await response.json()) as { mirrored: number };
}

/** A visible, read-only status record for every chat member. */
export async function publishChatNotice(message: string) {
  const url = `${env.CHAT_API_URL.replace(/\/$/, "")}/api/integration/notices`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CHAT_SERVICE_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ message }), signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ChatLinkError("The chat service could not publish the Workspace status notice."); }
  if (!response.ok) throw new ChatLinkError(`Chat could not publish the Workspace status notice (${response.status}).`);
  return (await response.json()) as { channelId: string; messageId: string };
}

/** Keeps a suspension or restoration consistent across both services. */
export async function setChatMemberAccess(workspaceUserId: string, disabled: boolean) {
  const url = `${env.CHAT_API_URL.replace(/\/$/, "")}/api/integration/members/${encodeURIComponent(workspaceUserId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: { authorization: `Bearer ${env.CHAT_SERVICE_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled }), signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ChatLinkError("The chat service could not update this member's access."); }
  if (!response.ok) throw new ChatLinkError(`Chat could not update this member's access (${response.status}).`);
}

/**
 * Removes a member from chat.
 *
 * Deliberately throws rather than swallowing a failure. Deleting an account in
 * one database and not the other is the worst of the three outcomes: the
 * member is gone from the roster but still inside the conversations, and no
 * one is told. The caller aborts, the Workspace account survives, and the
 * administrator can try again once chat is reachable.
 *
 * @param erase When true the chat row itself is deleted, which cascades away
 *   every message, reaction and attachment that member ever posted. When
 *   false the person is removed but their posts in shared channels remain.
 */
export async function removeMemberFromChat(workspaceUserId: string, erase: boolean, notice?: string): Promise<Removal> {
  const url = `${env.CHAT_API_URL.replace(/\/$/, "")}/api/integration/members/${encodeURIComponent(workspaceUserId)}?erase=${erase}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: { authorization: `Bearer ${env.CHAT_SERVICE_TOKEN}`, "content-type": "application/json" },
      body: notice ? JSON.stringify({ message: notice }) : undefined,
      // Long enough for a slow local start, short enough that an administrator
      // is not left watching a spinner.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ChatLinkError(
      "The chat service could not be reached, so nothing was deleted. Start it and try again.",
    );
  }

  if (response.status === 404) {
    // The whole integration surface answers 404 when the link is switched off.
    throw new ChatLinkError(
      "Chat is not configured to accept Workspace changes, so nothing was deleted.",
    );
  }
  if (response.status === 401) {
    throw new ChatLinkError(
      "Chat refused the Workspace service token, so nothing was deleted. The two must match.",
    );
  }
  if (!response.ok) {
    throw new ChatLinkError(`Chat could not remove the account (${response.status}), so nothing was deleted.`);
  }

  return (await response.json()) as Removal;
}
