# Administrator Guide

Management replies are private. Never upload invite files, exports, backups, or tokens to public channels.

## Commands

| Command | Purpose |
|---|---|
| `create` | Create an activity from a JSON attachment. |
| `list` | Download a private activity list. |
| `edit` | Merge a JSON patch and sync panels. |
| `import` | Import UTF-8 TXT codes, one per line. |
| `publish` | Publish a panel to the configured or selected channel. |
| `refresh` | Retry panel updates. |
| `pause` / `resume` | Stop or resume new claims. |
| `stats` | Show inventory, claims, capacity, roles, and alerts. |
| `lookup` | Look up one user's claim privately. |
| `export` | CSV of assigned codes and their Discord users. |
| `inventory` | CSV of every code and its status. |
| `backup` | Create and privately download a SQLite snapshot. |
| `disable` | Disable one unused code. |
| `retry-role` | Retry a tester-role assignment. |

Use `/invite-admin <command>` and provide the activity ID when requested. Codes are case-sensitive; blank lines and surrounding whitespace are ignored. Files must be UTF-8 and no larger than 1 MiB. Importing does not validate codes in Arena.

Use a public `forms.gle` or Google Forms filling URL. The feedback button only opens the form. The Bot needs Manage Roles and must be higher than the tester role.
