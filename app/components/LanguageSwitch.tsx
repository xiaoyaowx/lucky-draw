'use client';

import { LANG_LABEL, LANGS, LangScope } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/useI18n';

interface LanguageSwitchProps {
  /** front = 展示屏/签到页/嘉宾页；admin = 控制台/管理后台。两者偏好互不影响。 */
  scope: LangScope;
  /** 额外类名，例如展示屏用 lang-switch-floating 浮在角落 */
  className?: string;
}

/**
 * 语言切换开关。
 *
 * 做成「中文 | English」分段控件的样式而不是单个按钮：两个选项同时可见，
 * 现场工作人员一眼就知道当前在哪一档，不用先点一下才知道会切到哪。
 * 语言名按惯例用它自己的语言书写，所以不随当前语言翻译。
 */
export default function LanguageSwitch({ scope, className }: LanguageSwitchProps) {
  const { lang, setLang, t } = useI18n(scope);

  return (
    <div
      className={`lang-switch${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={t('common.switchLanguage')}
    >
      {LANGS.map(item => (
        <button
          key={item}
          type="button"
          className={item === lang ? 'active' : ''}
          aria-pressed={item === lang}
          onClick={() => setLang(item)}
        >
          {LANG_LABEL[item]}
        </button>
      ))}
    </div>
  );
}
