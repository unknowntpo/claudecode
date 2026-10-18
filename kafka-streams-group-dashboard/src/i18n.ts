// English and Traditional Chinese (Spec 003 Behavior 7). Protocol states, ids, topic, group, store and
// config names and units come from data and are never translated, so they never appear here.
import { ref } from 'vue'

export type Lang = 'en' | 'zh-Hant'
export const LANGS: Lang[] = ['en', 'zh-Hant']

const en = {
  'app.connecting': 'Connecting to the console server…',
  'app.connected': 'Connected',
  'app.disconnected': 'Disconnected',
  'app.pause': 'Pause',
  'app.resume': 'Resume',
  'nav.overview': 'Overview',
  'nav.groups': 'Groups',
  'nav.language': 'Language',
  'theme.label': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'overview.title': 'Overview',
  'overview.empty': 'The broker has no streams groups yet.',
  'metric.groups': 'Groups',
  'metric.groupsSummary': '{stable} stable, {moving} changing',
  'metric.processes': 'Processes',
  'metric.inputRate': 'Input rate',
  'metric.largestLag': 'Largest lag',
  'metric.groupEpoch': 'Group epoch',
  'metric.targetEpoch': 'Target assignment epoch',
  'metric.members': 'Members',
  'metric.processCount': '{n} processes',
  'metric.tasks': 'Tasks',
  'metric.subtopologyCount': '{n} subtopologies',
  'alert.viewProcesses': 'View processes',
  'table.group': 'Group',
  'table.state': 'State',
  'table.members': 'Members',
  'table.inputRate': 'Input rate',
  'table.largestLag': 'Largest lag',
  'table.groupEpoch': 'Group epoch',
  'table.topology': 'Topology',
  'group.standby': 'Standby replicas',
  'tip.standby': 'Applies at the next rebalance. Only stateful tasks get standbys.',
  'tip.more': 'More information',
  'tab.tasks': 'Tasks',
  'tab.processes': 'Processes',
  'tab.config': 'Configuration',
  'tab.log': 'Log',
  'tasks.filtered': 'Subtopology {id} only',
  'tasks.showAll': 'Show all',
  'tasks.empty': 'No members',
  'tasks.unowned': 'No member owns this task right now',
  'pipeline.label': 'Pipeline',
  'pipeline.empty': 'No topology yet. It appears when the first instance of the application joins: its first heartbeat sends the topology to the broker.',
  'pipeline.tasks': '{n} tasks',
  'pipeline.partitions': '{n} partitions',
  'drawer.close': 'Close',
  'drawer.input': 'Input',
  'drawer.lag': 'Lag',
  'drawer.tasks': 'Tasks',
  'drawer.topics': 'Topics',
  'drawer.in': 'In',
  'drawer.out': 'Out',
  'drawer.store': 'Store',
  'drawer.changelog': 'Changelog',
  'drawer.task': 'Task',
  'drawer.active': 'Active',
  'drawer.standby': 'Standby',
  'processes.empty': 'No processes',
  'config.key': 'Key',
  'config.value': 'Value',
  'config.scope': 'Scope',
  'config.group': 'group',
  'config.default': 'broker default',
  'config.none': 'No configuration reported yet.',
  'log.hideHeartbeats': 'Hide plain heartbeats',
  'log.empty': 'No events yet.',
  'status.stalled': 'stalled',
  'status.fenced': 'fenced',
  'metric.stalled': '{n} stalled',
  'alert.stalled': '{process} has made no progress for {s} s. If it does not recover, the broker fences it at the session timeout.',
  'alert.fenced': '{process} was fenced after no progress for {s} s; its tasks moved to other processes.',
  'tasks.stalled': 'No progress for {s} s',
  'status.restoring': 'restoring',
  'tasks.restoring': 'Restoring for {s} s',
  'tasks.progressAge': '{s} s ago',
  'processes.restoring': 'Restoring for {s} s.',
  'processes.changelog': 'Changelog',
  'tip.changelog': 'Records a new owner replays at most. Compaction and local state make it less.',
  'processes.stalled': 'No progress for {s} s.',
  'processes.fenced': 'Fenced after no progress for {s} s.',
  'processes.noOwner': 'no owner yet',
  'app.broker': 'Broker',
}

export type Key = keyof typeof en

const zhHant: Record<Key, string> = {
  'app.connecting': '正在連線到 console server…',
  'app.connected': '已連線',
  'app.disconnected': '已中斷連線',
  'app.pause': '暫停',
  'app.resume': '繼續',
  'nav.overview': '總覽',
  'nav.groups': '群組',
  'nav.language': '語言',
  'theme.label': '主題',
  'theme.system': '系統',
  'theme.light': '淺色',
  'theme.dark': '深色',
  'overview.title': '總覽',
  'overview.empty': 'Broker 上還沒有任何 streams 群組。',
  'metric.groups': '群組',
  'metric.groupsSummary': '{stable} 個穩定，{moving} 個變動中',
  'metric.processes': 'Process',
  'metric.inputRate': '輸入速率',
  'metric.largestLag': '最大 lag',
  'metric.groupEpoch': 'Group epoch',
  'metric.targetEpoch': 'Target assignment epoch',
  'metric.members': '成員',
  'metric.processCount': '{n} 個 process',
  'metric.tasks': 'Task',
  'metric.subtopologyCount': '{n} 個 subtopology',
  'alert.viewProcesses': '查看 process',
  'table.group': '群組',
  'table.state': '狀態',
  'table.members': '成員',
  'table.inputRate': '輸入速率',
  'table.largestLag': '最大 lag',
  'table.groupEpoch': 'Group epoch',
  'table.topology': 'Topology',
  'group.standby': 'Standby 副本',
  'tip.standby': '下次 rebalance 時生效。只有 stateful task 會有 standby。',
  'tip.more': '更多資訊',
  'tab.tasks': 'Task 分配',
  'tab.processes': 'Process',
  'tab.config': '設定',
  'tab.log': '記錄',
  'tasks.filtered': '只顯示 Subtopology {id}',
  'tasks.showAll': '顯示全部',
  'tasks.empty': '沒有成員',
  'tasks.unowned': '目前沒有成員負責這個 task',
  'pipeline.label': 'Pipeline',
  'pipeline.empty': '尚無 topology。應用程式的第一個實例加入時，它的第一個 heartbeat 會把 topology 送到 broker。',
  'pipeline.tasks': '{n} 個 task',
  'pipeline.partitions': '{n} 個 partition',
  'drawer.close': '關閉',
  'drawer.input': '輸入',
  'drawer.lag': 'Lag',
  'drawer.tasks': 'Task',
  'drawer.topics': 'Topic',
  'drawer.in': '輸入',
  'drawer.out': '輸出',
  'drawer.store': 'Store',
  'drawer.changelog': 'Changelog',
  'drawer.task': 'Task',
  'drawer.active': 'Active',
  'drawer.standby': 'Standby',
  'processes.empty': '沒有 process',
  'config.key': 'Key',
  'config.value': '值',
  'config.scope': '來源',
  'config.group': 'group',
  'config.default': 'broker 預設',
  'config.none': '尚未取得設定。',
  'log.hideHeartbeats': '隱藏一般 heartbeat',
  'log.empty': '還沒有事件。',
  'status.stalled': 'stalled',
  'status.fenced': 'fenced',
  'metric.stalled': '{n} 個 stalled',
  'alert.stalled': '{process} 已 {s} 秒沒有進度。若沒有恢復，broker 會在 session timeout 時 fence 它。',
  'alert.fenced': '{process} 在 {s} 秒沒有進度後被 fence，它的 task 已移到其他 process。',
  'tasks.stalled': '已 {s} 秒沒有進度',
  'status.restoring': 'restoring',
  'tasks.restoring': '重建 state 中，已 {s} 秒',
  'tasks.progressAge': '{s} 秒前',
  'processes.restoring': '重建 state 中，已 {s} 秒。',
  'processes.changelog': 'Changelog',
  'tip.changelog': '新 owner 最多要重播的筆數。compaction 和本地 state 會讓實際更少。',
  'processes.stalled': '已 {s} 秒沒有進度。',
  'processes.fenced': '在 {s} 秒沒有進度後被 fence。',
  'processes.noOwner': '尚無人接手',
  'app.broker': 'Broker',
}

export const DICTIONARIES: Record<Lang, Record<string, string>> = { en, 'zh-Hant': zhHant }

/** Data that must never be baked into a dictionary (CV5): it comes from the broker untranslated. */
export const PROTECTED_TERMS = [
  'STABLE', 'RECONCILING', 'ASSIGNING', 'NOT_READY', 'EMPTY', 'UNREVOKED_TASKS', 'UNRELEASED_TASKS',
  '0_0', '1_3', 'text-lines', 'word-count', 'page-views', 'counts-store', 'streams.session.timeout.ms',
]

/** CV7: the language's text, else English, with {name} placeholders filled in. */
export function t(
  lang: Lang,
  key: string,
  params: Record<string, string | number> = {},
  dicts: Record<Lang, Record<string, string>> = DICTIONARIES,
): string {
  const text = dicts[lang][key] ?? dicts.en[key] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

const STORAGE_KEY = 'streams-console.lang'

/** CV8: a valid stored choice, else Chinese when the browser prefers it, else English. */
export function detectLang(storage: Pick<Storage, 'getItem'> | undefined, languages: readonly string[]): Lang {
  try {
    const stored = storage?.getItem(STORAGE_KEY)
    if (stored && (LANGS as string[]).includes(stored)) return stored as Lang
  } catch {
    // storage blocked: fall through to the browser default
  }
  return languages.some((l) => l.toLowerCase().startsWith('zh')) ? 'zh-Hant' : 'en'
}

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const lang = ref<Lang>(typeof window === 'undefined' ? 'en' : detectLang(storage(), navigator.languages ?? []))

/** The viewer's language, shared by every component. */
export function useI18n() {
  const setLang = (next: Lang) => {
    lang.value = next
    document.documentElement.lang = next
    try {
      storage()?.setItem(STORAGE_KEY, next)
    } catch {
      // a per-viewer convenience only
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang.value
  return { lang, setLang, tr: (key: Key, params?: Record<string, string | number>) => t(lang.value, key, params) }
}
