import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import tr from './locales/tr.json'
import en from './locales/en.json'

i18n
  .use(initReactI18next)
  .init({
    resources: { tr: { translation: tr }, en: { translation: en } },
    lng: localStorage.getItem('i18nextLng') || 'tr',
    fallbackLng: 'tr',
    interpolation: { escapeValue: false },
  })

// Keep <html lang> in sync with the active language. Without this it stays
// hard-coded as "tr", so browsers apply Turkish case-folding rules to any
// CSS `uppercase` text even when displaying English — turning "i" into the
// Turkish dotted "İ" instead of a plain Latin "I" (e.g. "PLANNING" → "PLANNİNG").
document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
