// Theme switch (Spec 003 Behavior 9): System follows prefers-color-scheme; Light / Dark pin data-theme on <html>.
import { ref } from 'vue'

export type ThemeChoice = 'system' | 'light' | 'dark'
export const THEMES: ThemeChoice[] = ['system', 'light', 'dark']
const STORAGE_KEY = 'streams-console.theme'

/** CV15: a valid stored choice, else System (also when storage throws). */
export function detectTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const stored = storage?.getItem(STORAGE_KEY)
    if (stored && (THEMES as string[]).includes(stored)) return stored as ThemeChoice
  } catch {
    // storage blocked: System
  }
  return 'system'
}

/** The data-theme value for a choice; null means no attribute (follow the OS). */
export const themeAttribute = (choice: ThemeChoice): 'light' | 'dark' | null => (choice === 'system' ? null : choice)

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const apply = (choice: ThemeChoice) => {
  const attr = themeAttribute(choice)
  if (attr) document.documentElement.dataset.theme = attr
  else delete document.documentElement.dataset.theme
}

const theme = ref<ThemeChoice>(typeof window === 'undefined' ? 'system' : detectTheme(storage()))
if (typeof document !== 'undefined') apply(theme.value)

export function useTheme() {
  const setTheme = (next: ThemeChoice) => {
    theme.value = next
    apply(next)
    try {
      storage()?.setItem(STORAGE_KEY, next)
    } catch {
      // a per-viewer convenience only
    }
  }
  return { theme, setTheme }
}
