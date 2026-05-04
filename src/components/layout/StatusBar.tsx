import { useTranslation } from 'react-i18next'

export function StatusBar() {
  const { t } = useTranslation()

  return (
    <footer className="flex h-8 items-center justify-between border-t px-4 text-[11px] text-muted-foreground">
      <span>{t('status_bar.ready')}</span>
      <span>{t('common.version')} 0.1.0</span>
    </footer>
  )
}
