import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSkillZip, SKILL_DIR, ZIP_PATH } from './skill-zip';

describe('ptcg-coach.zip', () => {
  it('is committed', () => {
    expect(existsSync(ZIP_PATH)).toBe(true);
  });

  it('matches the skill source', () => {
    // The whole reason this test exists: the zip is a copy of files that are
    // also tracked, and nothing stops the two drifting. Uploading a stale
    // skill to claude.ai is silent — you get last week's coaching rules and no
    // sign that anything is wrong. The build is deterministic, so rebuilding
    // and comparing bytes is enough to catch it.
    const rebuilt = buildSkillZip();
    const committed = readFileSync(ZIP_PATH);
    expect(
      Buffer.compare(rebuilt, committed) === 0,
      'ptcg-coach.zip is out of date — run `npm run skill-zip` and commit it',
    ).toBe(true);
  });

  it('puts the skill folder at the archive root', () => {
    // claude.ai rejects a zip whose root is SKILL.md rather than the folder.
    const zip = buildSkillZip(SKILL_DIR).toString('latin1');
    expect(zip).toContain('ptcg-coach/SKILL.md');
    expect(zip).toContain('ptcg-coach/references/rules.md');
  });

  it('never packs the private playbook', () => {
    // The zip is committed to a PUBLIC repo; the playbook derives from a paid
    // guide and is gitignored as a plain file. Zipping it would leak it anyway.
    const zip = buildSkillZip(SKILL_DIR).toString('latin1');
    expect(zip).not.toContain('typhlosion-playbook');
  });

  it('is byte-identical across builds', () => {
    // A timestamp leaking into the headers would make every build differ and
    // turn the staleness check into noise everyone learns to ignore.
    expect(Buffer.compare(buildSkillZip(), buildSkillZip())).toBe(0);
  });
});
