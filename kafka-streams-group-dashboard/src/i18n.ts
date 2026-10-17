// English and Traditional Chinese (Spec 003 Behavior 7). Protocol states, ids, topic, group, store and
// config names and units come from data and are never translated, so they never appear here.
import { ref } from 'vue'

export type Lang = 'en' | 'zh-Hant'
export const LANGS: Lang[] = ['en', 'zh-Hant']

const en = {
  'app.live': 'live broker',
  'app.sim': 'simulator',
  'app.connecting': 'Connecting to the console server…',
  'app.connected': 'Connected',
  'app.disconnected': 'Disconnected',
  'app.pause': 'Pause',
  'app.resume': 'Resume',
  'app.reset': 'Reset',
  'nav.overview': 'Overview',
  'nav.groups': 'Groups',
  'nav.language': 'Language',
  'theme.label': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'overview.title': 'Overview',
  'overview.hint': 'Groups with a crashed member or growing lag are listed first. Select a group to open its pipeline.',
  'overview.empty': 'The broker has no streams groups yet.',
  'metric.groups': 'Groups',
  'metric.groupsNote': '{stable} stable, {moving} changing',
  'metric.processes': 'Processes',
  'metric.crashed': '{n} crashed',
  'metric.inputRate': 'Input rate',
  'metric.largestLag': 'Largest lag',
  'metric.groupEpoch': 'Group epoch',
  'metric.targetEpoch': 'Target assignment epoch',
  'metric.members': 'Members',
  'metric.processCount': '{n} processes',
  'metric.tasks': 'Tasks',
  'metric.subtopologyCount': '{n} subtopologies',
  'alert.crashedSince': '{process} stopped heart-beating {s} s ago. The broker fences it at the session timeout and its tasks move to another process.',
  'alert.crashed': '{process} stopped heart-beating. The broker fences it at the session timeout and its tasks move to another process.',
  'alert.viewProcesses': 'View processes',
  'table.group': 'Group',
  'table.state': 'State',
  'table.members': 'Members',
  'table.inputRate': 'Input rate',
  'table.largestLag': 'Largest lag',
  'table.groupEpoch': 'Group epoch',
  'table.topology': 'Topology',
  'group.standby': 'Standby replicas',
  'group.standbyNote': 'Standby changes apply at the next rebalance; only stateful tasks get standbys.',
  'group.start': 'Start new process',
  'tab.tasks': 'Tasks',
  'tab.processes': 'Processes',
  'tab.config': 'Configuration',
  'tab.log': 'Log',
  'tasks.filtered': 'Subtopology {id} only',
  'tasks.showAll': 'Show all',
  'tasks.hint': 'Select a pipeline node to open its details.',
  'tasks.empty': 'No members. Start a process to join the group.',
  'tasks.unowned': 'No member is processing this task right now',
  'action.thread': '+ thread',
  'action.threadTitle': 'Start one more StreamThread in this process',
  'action.stop': 'stop',
  'action.stopTitle': 'Graceful shutdown: members leave the group',
  'action.kill': 'kill',
  'action.killTitle': 'kill -9: fenced after the session timeout',
  'status.crashed': 'crashed',
  'status.joining': 'starting',
  'pipeline.label': 'Pipeline',
  'pipeline.empty': 'No topology yet. Start a process: its first heartbeat sends the topology to the broker.',
  'pipeline.tasks': '{n} tasks',
  'pipeline.sink': 'sink',
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
  'processes.empty': 'No processes. Start one to join the group.',
  'processes.crashedSince': 'Stopped heart-beating {s} s ago; fenced at the session timeout.',
  'processes.crashed': 'Stopped heart-beating; fenced at the session timeout.',
  'processes.starting': 'Starting the JVM…',
  'config.key': 'Key',
  'config.value': 'Value',
  'config.scope': 'Scope',
  'config.group': 'group',
  'config.default': 'broker default',
  'config.sim': 'The simulator has no broker configuration.',
  'config.none': 'No configuration reported yet.',
  'log.hideHeartbeats': 'Hide plain heartbeats',
  'log.empty': 'No events yet.',
}

export type Key = keyof typeof en

const zhHant: Record<Key, string> = {
  'app.live': '即時 broker',
  'app.sim': '模擬器',
  'app.connecting': '正在連線到 console server…',
  'app.connected': '已連線',
  'app.disconnected': '已中斷連線',
  'app.pause': '暫停',
  'app.resume': '繼續',
  'app.reset': '重設',
  'nav.overview': '總覽',
  'nav.groups': '群組',
  'nav.language': '語言',
  'theme.label': '主題',
  'theme.system': '系統',
  'theme.light': '淺色',
  'theme.dark': '深色',
  'overview.title': '總覽',
  'overview.hint': '有 crashed 成員或 lag 落後的群組排在最前面。點選群組可開啟它的 pipeline。',
  'overview.empty': 'Broker 上還沒有任何 streams 群組。',
  'metric.groups': '群組',
  'metric.groupsNote': '{stable} 個穩定，{moving} 個變動中',
  'metric.processes': 'Process',
  'metric.crashed': '{n} 個 crashed',
  'metric.inputRate': '輸入速率',
  'metric.largestLag': '最大 lag',
  'metric.groupEpoch': 'Group epoch',
  'metric.targetEpoch': 'Target assignment epoch',
  'metric.members': '成員',
  'metric.processCount': '{n} 個 process',
  'metric.tasks': 'Task',
  'metric.subtopologyCount': '{n} 個 subtopology',
  'alert.crashedSince': '{process} 已 {s} 秒沒有 heartbeat。Broker 會在 session timeout 時 fence 它，它的 task 會移到其他 process。',
  'alert.crashed': '{process} 已停止 heartbeat。Broker 會在 session timeout 時 fence 它，它的 task 會移到其他 process。',
  'alert.viewProcesses': '查看 process',
  'table.group': '群組',
  'table.state': '狀態',
  'table.members': '成員',
  'table.inputRate': '輸入速率',
  'table.largestLag': '最大 lag',
  'table.groupEpoch': 'Group epoch',
  'table.topology': 'Topology',
  'group.standby': 'Standby 副本',
  'group.standbyNote': 'Standby 設定會在下次 rebalance 生效；只有 stateful task 會有 standby。',
  'group.start': '啟動新 process',
  'tab.tasks': 'Task 分配',
  'tab.processes': 'Process',
  'tab.config': '設定',
  'tab.log': '記錄',
  'tasks.filtered': '只顯示 Subtopology {id}',
  'tasks.showAll': '顯示全部',
  'tasks.hint': '點選 pipeline 上的節點可開啟詳細資訊。',
  'tasks.empty': '目前沒有成員。啟動一個 process 來加入群組。',
  'tasks.unowned': '目前沒有成員在處理這個 task',
  'action.thread': '+ thread',
  'action.threadTitle': '在這個 process 再啟動一個 StreamThread',
  'action.stop': '停止',
  'action.stopTitle': '正常關閉：成員會離開群組',
  'action.kill': 'kill',
  'action.killTitle': 'kill -9：session timeout 後才會被 fence',
  'status.crashed': 'crashed',
  'status.joining': '啟動中',
  'pipeline.label': 'Pipeline',
  'pipeline.empty': '尚無 topology。啟動一個 process，它的第一個 heartbeat 會把 topology 送到 broker。',
  'pipeline.tasks': '{n} 個 task',
  'pipeline.sink': 'sink',
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
  'processes.empty': '目前沒有 process。啟動一個來加入群組。',
  'processes.crashedSince': '已 {s} 秒沒有 heartbeat，將在 session timeout 時被 fence。',
  'processes.crashed': '已停止 heartbeat，將在 session timeout 時被 fence。',
  'processes.starting': '正在啟動 JVM…',
  'config.key': 'Key',
  'config.value': '值',
  'config.scope': '來源',
  'config.group': 'group',
  'config.default': 'broker 預設',
  'config.sim': '模擬器沒有 broker 設定。',
  'config.none': '尚未取得設定。',
  'log.hideHeartbeats': '隱藏一般 heartbeat',
  'log.empty': '還沒有事件。',
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
