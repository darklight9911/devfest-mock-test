import { describe, expect, it } from 'vitest';
import { bn } from '../src/i18n/bn';
import { en } from '../src/i18n/en';
import { describeIssue, t } from '../src/i18n';
import type { IssueCode } from '../src/core/validate';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('Bangla has exactly the same keys as English', () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
  });

  it('every Bangla string is non-empty and keeps the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(bn[key].trim(), key).not.toBe('');
      expect(placeholders(bn[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('keeps the exact required English status strings', () => {
    expect(t('en', 'route.noRoute')).toBe('No route available');
    expect(t('en', 'route.startBlocked')).toBe('Starting location blocked');
  });

  it('fills placeholders', () => {
    expect(t('en', 'import.loaded', { name: 'a.json' })).toBe('Loaded: a.json');
  });

  it('has a message for every validation issue code in both languages', () => {
    const codes: IssueCode[] = [
      'file_too_large',
      'invalid_json',
      'not_object',
      'missing_field',
      'bad_field_type',
      'empty_building',
      'node_count',
      'edge_count',
      'node_not_object',
      'node_bad_id',
      'node_dup_id',
      'node_bad_label',
      'node_bad_type',
      'node_bad_coords',
      'edge_not_object',
      'edge_bad_id',
      'edge_dup_id',
      'edge_unknown_node',
      'edge_self_loop',
      'edge_dup_pair',
      'edge_bad_cost',
      'no_open_location',
      'no_exit',
      'state_bad_list',
      'state_unknown_id',
      'state_wrong_category',
    ];
    for (const code of codes) {
      for (const lang of ['en', 'bn'] as const) {
        expect(describeIssue(lang, { code, params: { id: 'X' } })).not.toContain('issue.');
      }
    }
  });
});
