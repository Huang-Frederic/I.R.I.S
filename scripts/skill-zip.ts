/**
 * Packs .claude/skills/ptcg-coach into the zip claude.ai asks for.
 *
 *   npm run skill-zip
 *
 * The skill is versioned as plain files — that is what Claude Code loads and
 * what diffs usefully. But claude.ai wants a zip with the skill folder at its
 * root, and GitHub cannot download a subfolder, so the archive is committed
 * beside the source.
 *
 * A committed build artifact rots silently, and a stale skill is worse than no
 * skill: you would upload last week's rules and wonder why the coach ignores
 * them. So the output is byte-for-byte deterministic — fixed timestamps, sorted
 * entries — and skill-zip.test.ts rebuilds it and compares. Editing SKILL.md
 * without re-running this fails the suite.
 *
 * Written by hand rather than with a dependency: the app has no zip library,
 * and the format needed here is small — stored paths are ASCII, the whole thing
 * is a few dozen kilobytes, so no zip64 and no unicode flags.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

export const SKILL_DIR = join(process.cwd(), '.claude', 'skills', 'ptcg-coach');
export const ZIP_PATH = join(process.cwd(), '.claude', 'skills', 'ptcg-coach.zip');

/**
 * Files that exist in the skill folder but must NEVER reach the zip: the zip is
 * committed to a PUBLIC repo, and these derive from paid content (gitignored as
 * plain files for the same reason). The skill degrades gracefully without them.
 */
export const PRIVATE_FILES = new Set(['references/typhlosion-playbook.md']);

/** 1980-01-01 00:00, the earliest a DOS timestamp can express. Any fixed value
 *  works; what matters is that it never depends on when the build ran. */
const DOS_TIME = 0;
const DOS_DATE = 33;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function buildSkillZip(dir = SKILL_DIR): Buffer {
  const root = posix.basename(dir.split(sep).join(posix.sep));
  // Sorted so the archive does not depend on directory-listing order.
  const files = walk(dir)
    .filter((f) => !PRIVATE_FILES.has(relative(dir, f).split(sep).join('/')))
    .sort();

  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = `${root}/${relative(dir, file).split(sep).join('/')}`;
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = readFileSync(file);
    const deflated = deflateRawSync(raw, { level: 9 });
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra
    locals.push(local, nameBuf, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(0, 30); // extra
    entry.writeUInt16LE(0, 32); // comment
    entry.writeUInt16LE(0, 34); // disk
    entry.writeUInt16LE(0, 36); // internal attrs
    entry.writeUInt32LE(0o644 << 16, 38); // external attrs — regular file
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, cd, end]);
}

function main() {
  const zip = buildSkillZip();
  writeFileSync(ZIP_PATH, zip);
  const files = walk(SKILL_DIR).filter(
    (f) => !PRIVATE_FILES.has(relative(SKILL_DIR, f).split(sep).join('/')),
  );
  console.log(`${files.length} fichier(s), ${(zip.length / 1024).toFixed(1)} Ko`);
  console.log(`sha256 ${createHash('sha256').update(zip).digest('hex').slice(0, 16)}`);
  console.log(`→ ${relative(process.cwd(), ZIP_PATH)}`);
}

// Only when run directly. `endsWith` rather than `includes`, so importing this
// from skill-zip.test.ts does not rewrite the very file the test is checking.
if (process.argv[1]?.endsWith('skill-zip.ts')) main();
