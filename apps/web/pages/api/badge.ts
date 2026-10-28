import type { NextApiRequest, NextApiResponse } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { CompactedMonitorStateWrapper, getFromStore } from '@/monitor/store'

// Upstream's edge route (a shields.io endpoint badge), as a Node API route.
type BadgePayload = {
  schemaVersion: 1
  label: string
  message: string
  color: string
  isError?: boolean
}

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
}

function errorBadge(label: string, message: string): BadgePayload {
  return {
    schemaVersion: 1,
    label,
    message,
    color: 'lightgrey',
    isError: true,
  }
}

function param(req: NextApiRequest, name: string): string | null {
  const v = req.query[name]
  return typeof v === 'string' ? v : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  for (const [k, v] of Object.entries(jsonHeaders)) res.setHeader(k, v)
  const monitorId = param(req, 'id')
  const label = param(req, 'label') ?? monitorId ?? 'UptimeFlare'
  try {
    const upMsg = param(req, 'up') ?? 'UP'
    const downMsg = param(req, 'down') ?? 'DOWN'
    const colorUp = param(req, 'colorUp') ?? 'brightgreen'
    const colorDown = param(req, 'colorDown') ?? 'red'

    if (!monitorId) {
      return res.status(400).send(JSON.stringify(errorBadge(label, 'no-monitor')))
    }

    const { env } = await getCloudflareContext({ async: true })
    const compactedState = new CompactedMonitorStateWrapper(await getFromStore(env, 'state'))

    const lastIncident = compactedState.getIncident(
      monitorId,
      compactedState.incidentLen(monitorId) - 1
    )
    const isUp = lastIncident?.end !== null

    const badge: BadgePayload = {
      schemaVersion: 1,
      label,
      message: isUp ? upMsg : downMsg,
      color: isUp ? colorUp : colorDown,
    }

    return res.status(200).send(JSON.stringify(badge))
  } catch (err) {
    console.error('Error rendering badge API:', err)
    return res.status(500).send(JSON.stringify(errorBadge('status', 'error')))
  }
}
