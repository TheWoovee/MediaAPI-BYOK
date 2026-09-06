// Move the client build under dist/client/studio so the asset router serves /studio/* for free.
import { readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const root = 'dist/client', sub = join(root, 'studio')
if (!existsSync(sub)) mkdirSync(sub)
for (const f of readdirSync(root)) if (f !== 'studio' && f !== '.assetsignore') renameSync(join(root, f), join(sub, f))
console.log('moved client build to', sub)
