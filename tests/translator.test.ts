import { describe, expect, it } from 'vitest';
import {
  isKoreanText,
  splitTextIntoChunks,
  translateHtmlToKorean,
} from '../src/main/translator';
import { DEFAULT_SETTINGS } from '../src/shared/presets';

describe('isKoreanText', () => {
  it('recognizes Korean emails as Korean', () => {
    expect(isKoreanText('안녕하세요. 이번 주 회의 일정을 공유드립니다.')).toBe(true);
    expect(isKoreanText('Re: 11월 청구서 확인 부탁드립니다 (Invoice #102)')).toBe(true);
  });

  it('recognizes non-Korean emails as foreign language', () => {
    expect(isKoreanText('Please review the attached quarterly financial report.')).toBe(false);
    expect(isKoreanText('明日の会議の資料を送付いたします。よろしくお願いいたします。')).toBe(false);
    expect(isKoreanText('请查看附件中的最新项目进度报告。')).toBe(false);
  });

  it('ignores URLs and email addresses when checking language', () => {
    expect(
      isKoreanText(
        'Hello, check https://kkachi.example.com/한글경로 and contact support@example.com for details.'
      )
    ).toBe(false);
  });

  it('treats empty or numeric-only strings as not needing translation', () => {
    expect(isKoreanText('')).toBe(true);
    expect(isKoreanText('123456 - 7890')).toBe(true);
  });
});

describe('splitTextIntoChunks', () => {
  it('never produces whitespace-only chunks when splitting multi-paragraph emails', () => {
    const paragraphs = Array.from(
      { length: 20 },
      (_, idx) => `Paragraph ${idx + 1}: ` + 'word '.repeat(45).trim()
    );
    const input = paragraphs.join('\n\n\n');

    const chunks = splitTextIntoChunks(input, 600);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
    expect(chunks.join('\n\n')).toBe(paragraphs.join('\n\n'));
  });
});

describe('translateHtmlToKorean', () => {
  it('preserves HTML structure, styles, images, attributes, and skips style/script tags', async () => {
    const html = [
      '<style>.title { color: #111; }</style>',
      '<div class="card" style="padding:16px">',
      '  <h1 class="title">  Weekly Product Update  </h1>',
      '  <img src="https://example.com/banner.png" alt="Banner" />',
      '  <p>Please check the <a href="https://example.com/docs">release notes</a> today.</p>',
      '  <p>이미 한국어 문장입니다.</p>',
      '  <footer>Weekly Product Update</footer>',
      '</div>',
    ].join('\n');

    const seenBatches: string[][] = [];
    const result = await translateHtmlToKorean(
      html,
      DEFAULT_SETTINGS,
      async (batch) => {
        seenBatches.push(batch);
        return batch.map((text) => `[KO:${text}]`);
      }
    );

    // Style tag must remain untouched and duplicate visible strings deduplicated
    expect(result).toContain('<style>.title { color: #111; }</style>');
    expect(result).toContain('<div class="card" style="padding:16px">');
    expect(result).toContain('<img src="https://example.com/banner.png" alt="Banner">');
    expect(result).toContain('<h1 class="title">  [KO:Weekly Product Update]  </h1>');
    expect(result).toContain(
      '<p>[KO:Please check the] <a href="https://example.com/docs">[KO:release notes]</a> [KO:today.]</p>'
    );
    expect(result).toContain('<p>이미 한국어 문장입니다.</p>');
    expect(result).toContain('<footer>[KO:Weekly Product Update]</footer>');
    // Deduplication check: "Weekly Product Update" sent only once
    const flattened = seenBatches.flat();
    expect(flattened.filter((t) => t === 'Weekly Product Update')).toHaveLength(1);
  });
});
