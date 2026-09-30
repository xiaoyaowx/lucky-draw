/**
 * i18n 运行时：翻译函数 + 语言偏好读写。
 *
 * 这个文件不依赖 React，服务端/客户端都能安全 import。
 * React 侧请用 `lib/i18n/useI18n.ts` 里的 hook。
 */

import { dictionaries, TranslationKey } from './dictionary';
import {
  DEFAULT_LANG,
  isLang,
  LANG_STORAGE_KEY,
  Lang,
  LangScope,
} from './types';

export * from './types';
export type { TranslationKey } from './dictionary';

/**
 * 取字典里的文案并按 `{name}` 占位符插值。
 *
 * 找不到 key 时直接把 key 原样返回：这样漏翻的地方在界面上一眼能看见，
 * 而不是变成空白或 "undefined" 让人以为是布局问题。
 */
export function translate(
  key: TranslationKey,
  lang: Lang,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[lang][key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * 读取某个作用域的语言偏好。
 *
 * 读取全程做防御：localStorage 可能被禁用（隐私模式）、也可能被手工写脏，
 * 任何一种情况都安静地退回默认中文，不要抛异常把整个页面搞白屏。
 */
export function readLang(scope: LangScope): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY[scope]);
    return isLang(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export function writeLang(scope: LangScope, lang: Lang): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY[scope], lang);
  } catch {
    // 存不进去也不影响本次会话，只是下次打开会回到默认语言
  }
}

export function nextLang(lang: Lang): Lang {
  return lang === 'zh' ? 'en' : 'zh';
}

/** 语言在界面上的自称写法：语言名按惯例用它自己的语言显示，不随当前语言变。 */
export const LANG_LABEL: Record<Lang, string> = {
  zh: '中文',
  en: 'English',
};

/**
 * 判断一个参与者字段的标签是否还是「出厂默认值」。
 *
 * `lib/participants.ts` 里默认字段的 label 是写死的中文「号码」，它属于程序
 * 自带的文案而不是管理员录入的数据。签到页要按当前语言显示它，否则外籍客人
 * 选了英文仍会看到「工号为 6 位数字」。
 *
 * 管理员一旦在「参与者字段」里改过 label，就说明那是他自己的数据，
 * 任何语言下都原样展示。
 */
export function isShippedFieldLabel(field: { key: string; label: string }): boolean {
  return field.key === 'number' && (field.label === '号码' || field.label === 'Number');
}
