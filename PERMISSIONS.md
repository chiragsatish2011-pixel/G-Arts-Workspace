# Permissions

| Role | Foundation permissions |
| --- | --- |
| SUPER_ADMIN | Manage users and roles; all workspace administration |
| ADMIN | Manage members; operate workspaces within granted routes |
| TEAM_LEAD | Create and manage work for assigned team scope |
| MEMBER | Participate in assigned work |
| TRAINEE | Limited participation as granted |
| GUEST | Read-only access to explicitly shared content |

The API is authoritative. Accounts are issued by administrators using a unique username and
display name. Role changes are consequential actions and must create a
security audit record; no viewing/activity data is recorded.

The administration workflow covers access, roles, account resets, and security-only audit
records. It does not expose member activity, location, time, screen, or file-view data.


## Administration today

`SUPER_ADMIN` may, from **Administration**:

- create an account (username, display name, title, temporary password, role)
- change a role, subject to `canManageRole`
- suspend an account and restore it — suspension revokes access immediately
- reset another member's password
- read the security audit log

`ADMIN` may view the member list. Suspended accounts remain visible to
administrators under the **Suspended** filter; hiding them would make suspension
irreversible from the interface.

Every member may edit their own profile and change their own password.
