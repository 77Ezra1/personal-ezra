import { useSettings, Language } from '../store/useSettings'

const dict = {
  zh: {
    search: '搜索…',
    new: '新建',
    table: '表格',
    card: '卡片',
    importExport: '导入 / 导出',
    sites: '站点',
    docs: '文档',
    vault: '保险库',
    dashboard: '工作台',
    chat: '对话',
    settings: '设置',
    tags: '标签',
    noTags: '（暂无标签）',
    view: '自定义视图',
    default: '默认',
    list: '列表',
    language: '语言',
    master: '设置主密码',
    save: '保存',
    cancel: '取消',
    chinese: '中文',
    english: 'English',
    comingSoon: '敬请期待',
    searchPlaceholder: '搜索（text、#标签、type:site|password|doc、url:、is:star）',
    total: '共',
    items: '条',
    quickCreate: '快速新建',
    lock: '锁定',
    unlock: '解锁',
    logout: '退出登录',
    createSite: '新建网站：',
    enter: '回车',
    passwords: '密码',
    open: '打开',
    locate: '定位',
    noMatches: '没有匹配结果',
    enterMasterPassword: '请输入主密码',
    wrongMasterPassword: '主密码错误'
  },
  en: {
    search: 'Search…',
    new: 'New',
    table: 'Table',
    card: 'Card',
    importExport: 'Import / Export',
    sites: 'Sites',
    docs: 'Docs',
    vault: 'Vault',
    dashboard: 'Dashboard',
    chat: 'Chat',
    settings: 'Settings',
    tags: 'Tags',
    noTags: '(no tags)',
    view: 'Default View',
    default: 'Default',
    list: 'List',
    language: 'Language',
    master: 'Set Master Password',
    save: 'Save',
    cancel: 'Cancel',
    chinese: 'Chinese',
    english: 'English',
    comingSoon: 'Coming soon',
    searchPlaceholder: 'Search (text, #tag, type:site|password|doc, url:, is:star)',
    total: 'Total',
    items: 'items',
    quickCreate: 'Quick Create',
    lock: 'Lock',
    unlock: 'Unlock',
    logout: 'Log out',
    createSite: 'Create site:',
    enter: 'Enter',
    passwords: 'Passwords',
    open: 'Open',
    locate: 'Locate',
    noMatches: 'No results',
    enterMasterPassword: 'Enter master password',
    wrongMasterPassword: 'Wrong master password'
  }
}

export type TKey = keyof typeof dict['zh']

export function translate(lang: Language, key: TKey): string {
  const d = dict[lang as keyof typeof dict] ?? dict.en
  return d[key] ?? dict.en[key] ?? key
}

export function useTranslation() {
  const lang = useSettings(s => s.language)
  return (key: TKey) => translate(lang, key)
}
