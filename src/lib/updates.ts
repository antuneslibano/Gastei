// Verifica se há uma versão mais nova do app publicada nos Releases do GitHub
// (mesmo esquema do app da loja: aviso no app + download do APK, que instala por cima mantendo os dados).
export const RELEASES_REPO = 'antuneslibano/Gastei';

export interface AvailableUpdate {
  version: string;
  downloadUrl: string;
  releaseUrl: string;
  notes: string;
}

/** Compara versões "1.2.3"; retorna > 0 se a for maior que b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  body?: string | null;
  assets: { name: string; browser_download_url: string }[];
}

export function parseRelease(release: GithubRelease, currentVersion: string): AvailableUpdate | null {
  if (release.draft || release.prerelease) return null;
  const version = release.tag_name.replace(/^v/, '');
  if (compareVersions(version, currentVersion) <= 0) return null;
  const apk = release.assets.find((asset) => asset.name.endsWith('.apk'));
  return {
    version,
    downloadUrl: apk?.browser_download_url ?? release.html_url,
    releaseUrl: release.html_url,
    notes: release.body ?? '',
  };
}

export async function checkForUpdate(currentVersion: string): Promise<AvailableUpdate | null> {
  const response = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) return null;
  return parseRelease((await response.json()) as GithubRelease, currentVersion);
}
