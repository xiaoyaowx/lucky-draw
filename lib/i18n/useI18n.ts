'use client';

import { useCallback, useEffect, useState } from 'react';
import { readLang, translate, writeLang } from './index';
import { DEFAULT_LANG, LANG_CHANGE_EVENT, Lang, LangScope, TranslateParams } from './types';
import type { TranslationKey } from './dictionary';

export interface I18n {
  /** 当前语言 */
  lang: Lang;
  /** 切换语言并持久化（只影响本 scope） */
  setLang: (lang: Lang) => void;
  /** 取文案，支持 {name} 插值 */
  t: (key: TranslationKey, params?: TranslateParams) => string;
}

/**
 * 取某个作用域的翻译能力。
 *
 * 之所以用 hook 而不是 React Context：本项目的页面彼此独立（展示屏、控制台、
 * 管理后台是三个互不相干的入口），套 Provider 反而要在每个页面手写一层包装组件；
 * 而作用域只有两个，直接用 `useI18n('admin')` 更直白。
 *
 * 组件之间的一致性靠 `LANG_CHANGE_EVENT` 广播：同一页面里并排渲染的多个组件
 * 各自持有 hook，任一组件切换语言后其他组件会跟着重渲染。
 *
 * 首屏固定按默认语言渲染，挂载后再读取用户偏好 —— 因为服务端渲染时读不到
 * localStorage，直接拿它当初始值会造成 hydration 前后不一致。代价是英文用户
 * 会看到极短一帧中文，可以接受。
 */
export function useI18n(scope: LangScope): I18n {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    setLangState(readLang(scope));

    const sync = () => setLangState(readLang(scope));
    // storage 事件只在「其他标签页」触发，本页内的切换要靠自定义事件
    window.addEventListener(LANG_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(LANG_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [scope]);

  const setLang = useCallback((next: Lang) => {
    writeLang(scope, next);
    setLangState(next);
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
  }, [scope]);

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) => translate(key, lang, params),
    [lang],
  );

  return { lang, setLang, t };
}
