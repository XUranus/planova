import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Eye, RotateCcw, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSceneStore } from '@/stores/sceneStore'
import { getPipelineArtifacts, type PipelineArtifacts } from '@/api/tasks'
import type { HomeSceneJSON } from '@/types/scene'

function ScoreBadge({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  const pct = Math.round(value * 100)
  const isGood = value >= threshold
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      {isGood ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{pct}%</div>
      </div>
    </div>
  )
}

export function ReviewGate({ projectId, sceneData, fileId }: { projectId: string; sceneData: HomeSceneJSON; fileId?: string }) {
  const { t } = useTranslation()
  const { acceptReview, retryParse, isRetrying } = useSceneStore()
  const [artifacts, setArtifacts] = useState<PipelineArtifacts | null>(null)
  const [loading, setLoading] = useState(true)

  const pq = sceneData.parse_quality

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getPipelineArtifacts(projectId)
        if (!cancelled) setArtifacts(data)
      } catch {
        // artifacts not available
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  const handleRetry = async () => {
    if (!fileId) return
    await retryParse(fileId)
  }

  const diagnosis = artifacts?.diagnosis

  return (
    <div className="relative flex flex-1 items-center justify-center p-6">
      {/* Retrying overlay */}
      {isRetrying && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('review.retrying')}</p>
          </div>
        </div>
      )}
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
          <h2 className="text-xl font-bold">{t('review.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('review.subtitle')}</p>
        </div>

        {/* Quality Scores */}
        {pq && (
          <Card>
            <CardHeader className="px-5 py-3">
              <CardTitle className="text-sm font-medium">{t('review.quality_scores')}</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ScoreBadge label={t('review.geometry')} value={pq.geometry_score} threshold={0.8} />
                <ScoreBadge label={t('review.semantic')} value={pq.semantic_score} threshold={0.5} />
                <ScoreBadge label={t('review.scale')} value={pq.scale_score} threshold={0.7} />
                <ScoreBadge label={t('review.alignment')} value={pq.image_alignment_score} threshold={0.75} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alignment Overlay */}
        {artifacts?.overlay_alignment && (
          <Card>
            <CardHeader className="px-5 py-3">
              <CardTitle className="text-sm font-medium">{t('review.alignment_overlay')}</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0">
              <div className="relative overflow-hidden rounded-md border">
                <img
                  src={`data:image/png;base64,${artifacts.overlay_alignment}`}
                  alt="Alignment overlay"
                  className="w-full"
                />
                <div className="absolute bottom-2 left-2 flex gap-3 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    {t('review.matched')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                    {t('review.missing')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    {t('review.extra')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Diagnosis Summary */}
        {diagnosis && (
          <Card>
            <CardHeader className="px-5 py-3">
              <CardTitle className="text-sm font-medium">{t('review.diagnosis')}</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0">
              <div className="space-y-2 text-sm">
                {diagnosis.missing_wall_regions.length > 0 && (
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>
                      {t('review.missing_walls')}: {diagnosis.missing_wall_regions.length} {t('review.regions')}
                    </span>
                  </div>
                )}
                {diagnosis.extra_wall_regions.length > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>
                      {t('review.extra_walls')}: {diagnosis.extra_wall_regions.length} {t('review.regions')}
                    </span>
                  </div>
                )}
                {diagnosis.scale_suspicious && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>
                      {t('review.scale_issue')}: {diagnosis.scale_reason || t('review.suspicious_scale')}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {t('review.room_coverage')}: {Math.round(diagnosis.room_coverage * 100)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scene Summary */}
        <Card>
          <CardHeader className="px-5 py-3">
            <CardTitle className="text-sm font-medium">{t('review.scene_summary')}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{sceneData.rooms?.length ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('review.rooms')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{sceneData.walls?.length ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('review.walls')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{sceneData.objects?.length ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('review.objects')}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('review.loading_artifacts')}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={acceptReview} className="flex-1 sm:flex-none">
            <ArrowRight className="mr-2 h-4 w-4" />
            {t('review.continue_3d')}
          </Button>
          <Button variant="outline" onClick={handleRetry} disabled={isRetrying || !fileId} className="flex-1 sm:flex-none">
            {isRetrying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            {t('review.retry_parse')}
          </Button>
          <Button variant="outline" onClick={acceptReview} className="flex-1 sm:flex-none">
            <Eye className="mr-2 h-4 w-4" />
            {t('review.view_2d')}
          </Button>
        </div>
      </div>
    </div>
  )
}
