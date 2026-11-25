import type { LoadLevel, SceneSource } from '../types/studio'

export interface LoadEstimate {
  level: LoadLevel
  score: number
  recommendSaver: boolean
}

/** Estimasi beban sebelum merekam (selaras dengan core-thermal/LoadEstimator.kt). */
export function estimateLoad(
  sources: SceneSource[],
  width: number,
  fps: number,
): LoadEstimate {
  const visible = sources.filter((s) => s.visible)
  let sourceScore = 0
  for (const s of visible) {
    if (s.type === 'SCREEN') sourceScore += 2.0
    else if (s.type === 'CAMERA') sourceScore += 1.4
    else if (s.type === 'IMAGE' || s.type === 'TEXT') sourceScore += 0.2
    else sourceScore += 0.1
  }
  const resFactor = width >= 1920 ? 1.5 : 1.0
  const fpsFactor = fps >= 60 ? 1.8 : 1.0
  const score = sourceScore * resFactor * fpsFactor

  let level: LoadLevel = 'LIGHT'
  if (score >= 9) level = 'MAXIMUM'
  else if (score >= 6) level = 'HEAVY'
  else if (score >= 3) level = 'MEDIUM'

  return {
    level,
    score,
    recommendSaver: level === 'HEAVY' || level === 'MAXIMUM',
  }
}
