/**
 * 国际化基础类型。
 *
 * 这里刻意不复用任何第三方 i18n 库：本项目是零构建步骤的 Next.js 应用，
 * 界面文案量在几百条量级，一个扁平的字典 + 一个 hook 已经够用，
 * 引入 i18next 这类库只会增加打包体积和一层需要理解的抽象。
 */

export type Lang = 'zh' | 'en';

/**
 * 语言作用域。
 *
 * 需求明确要求「前后端隔离保存」：把展示屏/签到页切到英文，不应该连带把
 * 管理后台也变成英文（现场常见场景是大屏给外籍客户看英文，而工作人员
 * 仍然希望后台是中文）。因此两个作用域各存一份互不相干的偏好。
 *
 * - front：面向观众与参与者 —— 展示屏 `/`、签到页 `/register`、嘉宾页 `/guest`
 * - admin：面向工作人员 —— 控制台 `/control`、管理后台 `/admin`
 */
export type LangScope = 'front' | 'admin';

export const LANGS: Lang[] = ['zh', 'en'];

export const DEFAULT_LANG: Lang = 'zh';

/** 每个作用域独立的 localStorage key，这是「隔离保存」的落点。 */
export const LANG_STORAGE_KEY: Record<LangScope, string> = {
  front: 'lucky-draw-lang-front',
  admin: 'lucky-draw-lang-admin',
};

/**
 * 同标签页内切换语言时派发的自定义事件名。
 *
 * `storage` 事件只在「其他」标签页触发，同一个页面里的多个组件收不到，
 * 所以需要自己发一个事件让并排渲染的组件（例如控制台里同时存在的
 * 语言开关和中奖记录区）一起重渲染。
 */
export const LANG_CHANGE_EVENT = 'lucky-draw:lang-change';

/** 插值参数，例如 t('control.overLimit', { n: 5 })。 */
export type TranslateParams = Record<string, string | number>;

export function isLang(value: unknown): value is Lang {
  return value === 'zh' || value === 'en';
}
