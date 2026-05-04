import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

const resources = {
  'en-US': { translation: enUS },
  'zh-CN': { translation: zhCN },
}

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('planova-lang') || 'en-US',
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false,
  },
})

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('planova-lang', lng)
})

export default i18n
