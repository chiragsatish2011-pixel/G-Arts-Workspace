import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";
import {
  addMember, deleteMember, listAudit, listMembers, resetMemberPassword, setMemberAccess, updateMemberTeam, updateRole,
  type AuditEntry, type Member, type Role, type Session, type Team,
} from "./api";

const roles: Role[] = ["ADMIN", "TEAM_LEAD", "MEMBER", "TRAINEE", "GUEST"];
const teams: Team[] = ["G_ARTS", "TRANSLATION", "G_NEWS"];
const chatOnlyRoles: Role[] = ["MEMBER", "TRAINEE", "GUEST"];
const readableTeam = (team: Team) => team === "G_ARTS" ? "G-Arts" : team === "TRANSLATION" ? "Translation" : "G-News · Chat only";

/** Whether the security log is left open, remembered between visits. */
const AUDIT_OPEN = "g-arts.audit-open";

const readableRole = (role: string) => role.replace("_", " ");

/**
 * Turns a stored row into a sentence.
 *
 * The log used to render `entry.action` on its own, so every line read
 * "User Created" and told an administrator nothing they could act on. Each
 * action now names the person who did it and the person it was done to.
 */
function describe(entry: AuditEntry) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const actor = entry.actor ? entry.actor.displayName : "A removed account";
  // Fall back to the name stored on the entry itself, so a line still reads
  // after the account it refers to has been deleted.
  const target = entry.target?.displayName ?? (meta.displayName ? String(meta.displayName) : "a removed account");

  switch (entry.action) {
    case "user_created":
      return `${actor} added ${target}${meta.assignedRole ? ` as ${readableRole(String(meta.assignedRole)).toLowerCase()}` : ""}`;
    case "role_changed":
      return meta.previousRole && meta.nextRole
        ? `${actor} changed ${target} from ${readableRole(String(meta.previousRole)).toLowerCase()} to ${readableRole(String(meta.nextRole)).toLowerCase()}`
        : `${actor} changed ${target}'s role`;
    case "team_changed":
      return meta.previousTeam && meta.nextTeam
        ? `${actor} moved ${target} from ${readableTeam(String(meta.previousTeam) as Team)} to ${readableTeam(String(meta.nextTeam) as Team)}`
        : `${actor} changed ${target}'s workspace`;
    case "member_access_suspended":
      return `${actor} suspended ${target}'s access`;
    case "member_access_restored":
      return `${actor} restored ${target}'s access`;
    case "member_password_reset":
      return `${actor} reset ${target}'s password`;
    case "member_deleted":
      // The account is gone, so `target` cannot be resolved — the name was
      // copied into the entry at the time precisely so this line still reads.
      return `${actor} deleted ${meta.displayName ?? "an account"}${meta.username ? ` (@${meta.username})` : ""}${
        meta.erasedChatHistory ? ", including everything they posted" : ""
      }`;
    default:
      return `${actor} · ${entry.action.replaceAll("_", " ")} · ${target}`;
  }
}

export function AdminPanel({ session }: { session: Session }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ displayName: "", username: "", title: "", role: "MEMBER" as Role, team: "G_ARTS" as Team });
  const [showAudit, setShowAudit] = useState(() => localStorage.getItem(AUDIT_OPEN) === "yes");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  useEffect(() => { localStorage.setItem(AUDIT_OPEN, showAudit ? "yes" : "no"); }, [showAudit]);

  const reload = async () => {
    try {
      setMembers(await listMembers(session.token));
      if (isSuperAdmin) setAudit(await listAudit(session.token));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not load administration data");
    }
  };

  useEffect(() => { void reload(); }, [session.token]);

  const act = async (work: () => Promise<unknown>, message: string) => {
    try {
      await work();
      setNotice(message);
      await reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "That action could not be completed");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const handed = { username: form.username };
    void act(
      async () => {
        await addMember(session.token, form);
        setForm({ displayName: "", username: "", title: "", role: "MEMBER", team: "G_ARTS" });
      },
      `@${handed.username} can now sign in with the temporary password gurukul. They should change it under Account.`,
    );
  };

  const needle = query.trim().toLowerCase();
  const filtered = members.filter((member) =>
    `${member.displayName} ${member.username} ${member.title ?? ""}`.toLowerCase().includes(needle),
  );
  const active = members.filter((member) => !member.deletedAt).length;

  return (
    <section className="admin-page">
      <div className="admin-title">
        <div>
          <span className="eyebrow">WORKSPACE GOVERNANCE</span>
          <h1>Administration</h1>
          <p>Manage access and roles. This page records security actions only; it never monitors member activity.</p>
        </div>
        <div className="admin-summary">
          <strong>{active}</strong>
          <span>active members</span>
        </div>
      </div>

      {notice && <p className="notice" role="status">{notice}</p>}

      {isSuperAdmin ? (
        <form className="admin-create" onSubmit={submit}>
          <div>
            <label>Display name
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
            </label>
            <label>Username
              {/* Sanitised as it is typed. The server strips spaces, capitals
                  and punctuation anyway; doing it silently meant the account
                  was created under a name the administrator never saw and then
                  handed out the wrong one. */}
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })}
                placeholder="arjun.media"
                minLength={3}
                required
              />
            </label>
            <label>Team title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Photographer" />
            </label>
            <p className="admin-password-note">New accounts start with the temporary password <strong>gurukul</strong>. Only the member chooses a replacement in Account.</p>
            <label>Workspace role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(form.team === "G_NEWS" ? chatOnlyRoles : roles).map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
            <label>Workspace type
              <select value={form.team} onChange={(e) => { const team = e.target.value as Team; setForm({ ...form, team, role: team === "G_NEWS" ? "MEMBER" : form.role }); }}>
                {teams.map((team) => <option key={team} value={team}>{readableTeam(team)}</option>)}
              </select>
            </label>
          </div>
          <button>Add member</button>
        </form>
      ) : (
        <p className="admin-readonly">
          You can review members and reset a lower-level member's password to the standard temporary password. Only a super-admin can change access, roles, or workspace type.
        </p>
      )}

      <div className="admin-section">
        <div className="admin-section-heading">
          <h2>Members</h2>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" aria-label="Search members" />
        </div>
        <div className="admin-members">
          {filtered.length === 0
            ? <p className="empty">No member matches “{query.trim()}”.</p>
            : filtered.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  session={session}
                  editable={isSuperAdmin}
                  canResetPassword={isSuperAdmin
                    ? member.role !== "SUPER_ADMIN"
                    : session.user.role === "ADMIN" && ["TEAM_LEAD", "MEMBER", "TRAINEE", "GUEST"].includes(member.role)}
                  act={act}
                  ask={setConfirm}
                />
              ))}
        </div>
      </div>

      {/* Folded away by default. It is a record to consult when something
          needs checking, not something to read past on every visit. The
          choice is remembered, so anyone who wants it open keeps it open. */}
      {isSuperAdmin && (
        <div className="admin-section audit">
          <div className="admin-section-heading">
            <div>
              <h2>Security action log</h2>
              <p>Account and permission changes only.</p>
            </div>
            <button type="button" className="audit-toggle" onClick={() => setShowAudit(!showAudit)} aria-expanded={showAudit}>
              {showAudit ? "Hide" : "Show"}
              {!showAudit && audit.length > 0 && <span className="audit-count">{audit.length}</span>}
            </button>
          </div>
          {showAudit &&
            (audit.length === 0 ? (
              <p className="empty">No security actions recorded yet.</p>
            ) : (
              audit.map((entry) => (
                <div className="audit-entry" key={entry.id}>
                  <span>{describe(entry)}</span>
                  <small>{new Date(entry.createdAt).toLocaleString()}</small>
                </div>
              ))
            ))}
        </div>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

function MemberRow({
  member, session, editable, canResetPassword, act, ask,
}: {
  member: Member;
  session: Session;
  editable: boolean;
  act: (work: () => Promise<unknown>, message: string) => Promise<void>;
  ask: (request: ConfirmRequest) => void;
  canResetPassword: boolean;
}) {
  const changeRole = (role: Role) =>
    ask({
      title: "Change role",
      body: <p>Give <strong>{member.displayName}</strong> the {readableRole(role).toLowerCase()} role?</p>,
      confirmLabel: "Change role",
      onConfirm: () => act(() => updateRole(session.token, member.id, role), `${member.displayName}'s role was updated.`),
    });

  const changeTeam = (team: Team) =>
    ask({
      title: "Change workspace type",
      body: <p>Move <strong>{member.displayName}</strong> to the {readableTeam(team)} workspace?</p>,
      confirmLabel: "Change workspace",
      onConfirm: () => act(() => updateMemberTeam(session.token, member.id, team), `${member.displayName}'s workspace was updated.`),
    });

  const changeAccess = () => {
    const suspending = !member.deletedAt;
    ask({
      title: suspending ? "Suspend access" : "Restore access",
      body: suspending ? (
        <p>
          <strong>{member.displayName}</strong> will not be able to sign in to the Workspace or chat.
          Nothing is deleted, and you can restore them at any time.
        </p>
      ) : (
        <p><strong>{member.displayName}</strong> will be able to sign in again.</p>
      ),
      confirmLabel: suspending ? "Suspend" : "Restore access",
      destructive: suspending,
      onConfirm: () =>
        act(
          () => setMemberAccess(session.token, member.id, suspending),
          suspending ? `${member.displayName}'s access was suspended.` : `${member.displayName}'s access was restored.`,
        ),
    });
  };

  const resetPassword = () =>
    ask({
      title: "Reset to temporary password?",
      body: <p><strong>{member.displayName}</strong>'s password will become <strong>gurukul</strong>. Share it with them securely; they can immediately choose their own password in Account.</p>,
      confirmLabel: "Reset to gurukul",
      onConfirm: () => act(() => resetMemberPassword(session.token, member.id), `${member.displayName}'s password was reset to gurukul.`),
    });

  /**
   * Deleting is not suspending: there is no undo, and it reaches into chat.
   * The name has to be typed out so a misplaced click cannot do this, and what
   * happens to their messages is asked in the same dialog rather than in a
   * second box after the decision has already been made.
   */
  const removeAccount = () =>
    ask({
      title: `Delete ${member.displayName}?`,
      destructive: true,
      typeToConfirm: member.username,
      confirmLabel: "Delete permanently",
      option: {
        label: "Also delete everything they posted",
        hint: "Removes their messages, files and reactions from every channel. Replies to them will no longer make sense.",
      },
      body: (
        <>
          <p>
            They will be removed from the Workspace and from chat, and their private chats will be deleted.
            This cannot be undone.
          </p>
          <p className="modal-note">
            By default their posts in shared channels stay, shown as “Removed member”, so nobody else's
            conversation is left with gaps.
          </p>
        </>
      ),
      onConfirm: (erase) =>
        act(
          () => deleteMember(session.token, member.id, erase),
          erase
            ? `${member.displayName} and everything they posted were deleted.`
            : `${member.displayName} was deleted. Their posts remain as “Removed member”.`,
        ),
    });

  const isProtected = member.role === "SUPER_ADMIN";
  const canEdit = editable && !isProtected;

  return (
    <article className={`admin-member ${member.deletedAt ? "is-suspended" : ""}`}>
      <div className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</div>
      <div className="admin-member-name">
        <strong>{member.displayName}{member.id === session.user.id ? " (you)" : ""}</strong>
        <span>@{member.username}{member.title ? ` · ${member.title}` : ""}</span>
      </div>

      {/* The badge and the dropdown said the same thing side by side. The
          dropdown already shows the current role, so the badge only appears
          where there is no dropdown — or to flag a suspension, which the
          dropdown cannot show. */}
      {member.deletedAt
        ? <span className="role is-suspended-badge">SUSPENDED</span>
        : canEdit ? null : <span className="role">{readableRole(member.role)}</span>}

      {canEdit && (
        <div className="admin-actions">
          <select aria-label={`Workspace type for ${member.displayName}`} value={member.team} onChange={(e) => changeTeam(e.target.value as Team)}>
            {teams.map((team) => <option key={team} value={team}>{readableTeam(team)}</option>)}
          </select>
          <select aria-label={`Role for ${member.displayName}`} value={member.role} onChange={(e) => changeRole(e.target.value as Role)}>
            {roles.map((role) => <option key={role}>{role}</option>)}
          </select>
          <button type="button" onClick={resetPassword}>Reset password</button>
          <button type="button" className={member.deletedAt ? "restore" : "suspend"} onClick={changeAccess}>
            {member.deletedAt ? "Restore access" : "Suspend"}
          </button>
          <button type="button" className="remove" onClick={removeAccount}>Delete</button>
        </div>
      )}
      {!canEdit && canResetPassword && !isProtected && (
        <div className="admin-actions"><button type="button" onClick={resetPassword}>Reset password</button></div>
      )}
    </article>
  );
}
