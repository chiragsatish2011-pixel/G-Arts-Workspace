import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { avatarSrc, changeMyPassword, forgetAvatar, removeMyAvatar, updateMyProfile, uploadMyAvatar, type Session } from "./api";

/**
 * Profile lives here, in the workspace, because the workspace owns every
 * account. Editing it in chat would have meant two places to change a name and
 * only one of them authoritative.
 */

const ACCENTS = ["#a8121a", "#b5651e", "#c08a2e", "#2f6f4f", "#2f7d8a", "#3d5a8a", "#6b4a8a", "#7a4a2a"];

export function ProfilePanel({ session, onUpdated }: { session: Session; onUpdated: (s: Session) => void }) {
  const [displayName, setDisplayName] = useState(session.user.displayName);
  const [title, setTitle] = useState((session.user as { title?: string | null }).title ?? "");
  const [accent, setAccent] = useState<string | null>((session.user as { accentColor?: string | null }).accentColor ?? null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const avatarKey = (session.user as { avatarUrl?: string | null }).avatarUrl ?? null;
  const [face, setFace] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!avatarKey) { setFace(null); return; }
    let live = true;
    avatarSrc(session.token, avatarKey).then((u) => live && setFace(u)).catch(() => live && setFace(null));
    return () => { live = false; };
  }, [avatarKey, session.token]);

  async function pickPhoto(file: File) {
    setUploading(true); setError(""); setNotice("");
    try {
      if (avatarKey) forgetAvatar(avatarKey);
      const updated = await uploadMyAvatar(session.token, file);
      onUpdated({ ...session, user: { ...session.user, ...updated } });
      setNotice("Profile picture updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload that picture");
    } finally { setUploading(false); }
  }

  async function dropPhoto() {
    try {
      if (avatarKey) forgetAvatar(avatarKey);
      const updated = await removeMyAvatar(session.token);
      onUpdated({ ...session, user: { ...session.user, ...updated } });
      setFace(null);
      setNotice("Profile picture removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the picture");
    }
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  useEffect(() => { setNotice(""); setError(""); }, [displayName, title, accent]);

  const dirty =
    displayName !== session.user.displayName ||
    title !== ((session.user as { title?: string | null }).title ?? "") ||
    accent !== ((session.user as { accentColor?: string | null }).accentColor ?? null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await updateMyProfile(session.token, {
        displayName: displayName.trim(),
        title: title.trim() || null,
        accentColor: accent,
      });
      onUpdated(updated);
      setNotice("Profile saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setChanging(true); setError(""); setNotice("");
    try {
      await changeMyPassword(session.token, currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword("");
      setNotice("Password changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change your password");
    } finally {
      setChanging(false);
    }
  }

  const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

  return (
    <div className="band band-paper">
      <div className="band-inner profile-page">
        <div className="profile-hero">
          <label className="profile-face-wrap" title="Change your profile picture">
            <span className="profile-face" style={accent && !face ? { background: accent } : undefined}>
              {face ? <img src={face} alt="" /> : initials}
            </span>
            <span className="profile-face-edit">{uploading ? "Uploading…" : face ? "Change photo" : "Add photo"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ""; }}
            />
          </label>
          <div>
            <span className="eyebrow">YOUR ACCOUNT</span>
            <h1>{session.user.displayName}</h1>
            <p>@{session.user.username} · {session.user.role.replace("_", " ").toLowerCase()}</p>
            {face && <button type="button" className="text-button" onClick={() => void dropPhoto()}>Remove picture</button>}
          </div>
        </div>

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <div className="profile-grid">
          <section className="admin-section">
            <h2>Details</h2>
            <form className="profile-form" onSubmit={save}>
              <label>Your name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} required /></label>
              <label>Role or title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Videography and Editing" /></label>

              <span className="eyebrow" style={{ marginTop: ".4rem" }}>YOUR COLOUR</span>
              <div className="accent-row">
                {ACCENTS.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    aria-label={`Use ${colour}`}
                    className={accent === colour ? "accent is-on" : "accent"}
                    style={{ background: colour }}
                    onClick={() => setAccent(colour)}
                  />
                ))}
              </div>

              <button disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</button>
            </form>
          </section>

          <section className="admin-section">
            <h2>Password</h2>
            <form className="profile-form" onSubmit={changePassword}>
              <label>Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required /></label>
              <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={4} required /></label>
              <p className="hint">At least 4 characters. This is the password for every space, including chat.</p>
              <button disabled={changing || !currentPassword || newPassword.length < 4}>{changing ? "Changing…" : "Change password"}</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
