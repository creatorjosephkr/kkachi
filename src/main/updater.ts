import type { AppUpdateInfo } from '../shared/types';

export const GITHUB_REPO = 'creatorjosephkr/kkachi';
export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

export function normalizeVersion(raw: string): string {
  return (raw || '').trim().replace(/^v/i, '');
}

interface ParsedSemver {
  core: [number, number, number];
  prerelease: string[];
}

function parseSemver(raw: string): ParsedSemver {
  const cleaned = normalizeVersion(raw).split('+')[0] ?? '';
  const [corePart, ...preParts] = cleaned.split('-');
  const nums = (corePart || '0.0.0').split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return {
    core: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0],
    prerelease: preParts.length > 0 ? preParts.join('-').split('.').filter(Boolean) : [],
  };
}

/**
 * Returns > 0 if version `a` is newer than `b`, < 0 if older, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) {
      return pa.core[i] - pb.core[i];
    }
  }

  // Release version > prerelease version (e.g. 1.0.0 > 1.0.0-beta.1)
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;

  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const segA = pa.prerelease[i];
    const segB = pb.prerelease[i];
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;
    const numA = /^\d+$/.test(segA) ? Number(segA) : null;
    const numB = /^\d+$/.test(segB) ? Number(segB) : null;
    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA - numB;
    } else if (numA !== null) {
      return -1;
    } else if (numB !== null) {
      return 1;
    } else if (segA !== segB) {
      return segA < segB ? -1 : 1;
    }
  }
  return 0;
}

interface GitHubReleaseApiResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export async function checkForGitHubReleaseUpdate(
  currentVersion: string,
  options?: {
    repo?: string;
    fetchFn?: typeof fetch;
  }
): Promise<AppUpdateInfo> {
  const repo = options?.repo ?? GITHUB_REPO;
  const fetchFn = options?.fetchFn ?? fetch;
  const normalizedCurrent = normalizeVersion(currentVersion) || '0.0.0';
  const fallbackUrl = `https://github.com/${repo}/releases`;

  try {
    const res = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Kkachi-App/${normalizedCurrent}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        currentVersion: normalizedCurrent,
        latestVersion: normalizedCurrent,
        hasUpdate: false,
        releaseName: '',
        releaseNotes: '',
        releaseUrl: fallbackUrl,
        error: `업데이트 정보를 불러오지 못했습니다 (HTTP ${res.status}).`,
      };
    }

    const data = (await res.json()) as GitHubReleaseApiResponse;
    const latestVersion = normalizeVersion(data.tag_name || '');
    if (!latestVersion) {
      return {
        currentVersion: normalizedCurrent,
        latestVersion: normalizedCurrent,
        hasUpdate: false,
        releaseName: '',
        releaseNotes: '',
        releaseUrl: data.html_url || fallbackUrl,
      };
    }

    const hasUpdate = !data.draft && compareSemver(latestVersion, normalizedCurrent) > 0;
    return {
      currentVersion: normalizedCurrent,
      latestVersion,
      hasUpdate,
      releaseName: data.name || `v${latestVersion}`,
      releaseNotes: (data.body || '').trim(),
      releaseUrl: data.html_url || `${fallbackUrl}/tag/v${latestVersion}`,
      publishedAt: data.published_at,
    };
  } catch (err) {
    return {
      currentVersion: normalizedCurrent,
      latestVersion: normalizedCurrent,
      hasUpdate: false,
      releaseName: '',
      releaseNotes: '',
      releaseUrl: fallbackUrl,
      error:
        err instanceof Error
          ? `업데이트 확인 실패: ${err.message}`
          : '업데이트 확인 중 네트워크 오류가 발생했습니다.',
    };
  }
}
