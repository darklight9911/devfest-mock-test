import type { Lang } from '../types';
import type { ValidationIssue } from '../core/validate';
import { bn } from './bn';
import { en, type MessageKey } from './en';

export type { MessageKey };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, bn };

export type Params = Record<string, string | number>;

/** Looks up a message and fills `{placeholders}`. */
export function t(lang: Lang, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Turns a language-free validation issue into a sentence. */
export function describeIssue(lang: Lang, issue: ValidationIssue): string {
  return t(lang, `issue.${issue.code}` as MessageKey, issue.params);
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'bn';
}
