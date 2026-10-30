/** Create invite codes for friends. Usage: pnpm invite [count] */
import { createInvites } from "../auth";

const count = Math.min(Math.max(Number(process.argv[2] ?? 1) || 1, 1), 50);
for (const code of createInvites(count)) console.log(code);
