import { readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = 'dist/client', sub = join(root, 'studio');
if (!existsSync(sub)) mkdirSync(sub, { recursive: true });
for (const f of readdirSync(root)) if (f !== 'studio' && f !== '.assetsignore') renameSync(join(root, f), join(sub, f));
process.stdout.write(`moved client build to ${sub}\n`);
