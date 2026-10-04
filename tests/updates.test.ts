import { describe, expect, it } from 'vitest';
import { compareVersions, parseRelease } from '../src/lib/updates';

const release = (tag: string, extra = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/x/releases/${tag}`,
  draft: false,
  prerelease: false,
  assets: [{ name: `Gastei-${tag.slice(1)}.apk`, browser_download_url: `https://dl/${tag}.apk` }],
  ...extra,
});

describe('atualizações', () => {
  it('compara versões', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });
  it('detecta versão nova com APK', () => {
    expect(parseRelease(release('v0.2.0'), '0.1.0')).toMatchObject({ version: '0.2.0', downloadUrl: 'https://dl/v0.2.0.apk' });
  });
  it('ignora versão igual, antiga, rascunho e pré-lançamento', () => {
    expect(parseRelease(release('v0.1.0'), '0.1.0')).toBeNull();
    expect(parseRelease(release('v0.0.9'), '0.1.0')).toBeNull();
    expect(parseRelease(release('v0.2.0', { draft: true }), '0.1.0')).toBeNull();
    expect(parseRelease(release('v0.2.0', { prerelease: true }), '0.1.0')).toBeNull();
  });
});
