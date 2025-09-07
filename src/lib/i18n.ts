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
    results: '结果',
    lock: '锁定',
    unlock: '解锁',
    logout: '退出登录',
    createSitePrefix: '新建网站：',
    pressEnter: '回车',
    passwords: '密码',
    open: '打开',
    locate: '定位',
    noResults: '没有匹配结果',
    enterMaster: '请输入主密码',
    wrongMaster: '主密码错误'
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
    results: 'Results',
    lock: 'Lock',
    unlock: 'Unlock',
    logout: 'Log out',
    createSitePrefix: 'Create site:',
    pressEnter: 'Enter',
    passwords: 'Passwords',
    open: 'Open',
    locate: 'Locate',
    noResults: 'No matching results',
    enterMaster: 'Enter master password',
    wrongMaster: 'Incorrect master password'
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
