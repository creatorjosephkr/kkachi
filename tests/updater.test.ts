import { describe, expect, it, vi } from 'vitest';
import {
  checkForGitHubReleaseUpdate,
  compareSemver,
  normalizeVersion,
} from '../src/main/updater';

describe('updater semver comparison', () => {
  it('normalizes version tags cleanly', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion(' V2.0.0 ')).toBe('2.0.0');
  });

  it('compares major, minor, patch, and prerelease versions accurately', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.10.0', '1.2.0')).toBeGreaterThan(0);
    expect(compareSemver('v2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', 'v1.0.0')).toBe(0);
    expect(compareSemver('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(compareSemver('0.9.9', '1.0.0')).toBeLessThan(0);
  });
});

describe('checkForGitHubReleaseUpdate', () => {
  it('detects newer GitHub release with markdown body and download URL', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.1.0',
        name: 'Kkachi v1.1.0',
        body: '## 변경 사항\n- **PDF 저장** 추가\n- 까치 비행 설정 개선',
        html_url: 'https://github.com/creatorjosephkr/kkachi/releases/tag/v1.1.0',
        published_at: '2026-11-24T02:00:00Z',
        draft: false,
      }),
    })) as unknown as typeof fetch;

    const info = await checkForGitHubReleaseUpdate('1.0.0', { fetchFn: mockFetch });
    expect(info.hasUpdate).toBe(true);
    expect(info.currentVersion).toBe('1.0.0');
    expect(info.latestVersion).toBe('1.1.0');
    expect(info.releaseName).toBe('Kkachi v1.1.0');
    expect(info.releaseNotes).toContain('## 변경 사항');
    expect(info.releaseUrl).toBe('https://github.com/creatorjosephkr/kkachi/releases/tag/v1.1.0');
  });

  it('reports no update when already on latest version', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.0',
        name: 'Kkachi v1.0.0',
        body: 'Initial release',
        html_url: 'https://github.com/creatorjosephkr/kkachi/releases/tag/v1.0.0',
        draft: false,
      }),
    })) as unknown as typeof fetch;

    const info = await checkForGitHubReleaseUpdate('1.0.0', { fetchFn: mockFetch });
    expect(info.hasUpdate).toBe(false);
    expect(info.latestVersion).toBe('1.0.0');
    expect(info.error).toBeUndefined();
  });

  it('handles HTTP and network failures gracefully without throwing', async () => {
    const mockHttpFail = vi.fn(async () => ({
      ok: false,
      status: 403,
    })) as unknown as typeof fetch;

    const httpInfo = await checkForGitHubReleaseUpdate('1.0.0', { fetchFn: mockHttpFail });
    expect(httpInfo.hasUpdate).toBe(false);
    expect(httpInfo.error).toContain('HTTP 403');

    const mockNetFail = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const netInfo = await checkForGitHubReleaseUpdate('1.0.0', { fetchFn: mockNetFail });
    expect(netInfo.hasUpdate).toBe(false);
    expect(netInfo.error).toContain('offline');
  });
});
