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
    comingSoon: '敬请期待'
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
    comingSoon: 'Coming soon'
  }
}

export type TKey = keyof typeof dict['zh']

export function translate(lang: Language, key: TKey): string {
  return dict[lang][key]
}

export function useTranslation() {
  const lang = useSettings(s => s.language)
  return (key: TKey) => translate(lang, key)
}
