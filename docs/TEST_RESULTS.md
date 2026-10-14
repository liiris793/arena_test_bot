# Test results and launch checklist

The automated suite contains 17 passing tests covering imports, capacity, duplicate claims, concurrent allocation, restart recovery, panel synchronization, Google Forms, role failures, permissions, CSV escaping, backups, and interaction recovery.

Run:

```bash
npm run typecheck
npm test
npm run build
```

Before production, use a test server and verify command registration, activity creation, code import, two-user claiming, duplicate claiming, restart recovery, feedback-link updates, role retry, assigned-code export, complete-inventory export, and backup restore.
