import type { NextApiRequest, NextApiResponse } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { maintenances, workerConfig } from '@/uptime.config'
import { CompactedMonitorStateWrapper, getFromStore } from '@/monitor/store'

// Upstream's edge route, as a Node API route (OpenNext runs no edge runtime):
// the same headers, the same body, the D1 binding from the Worker's env.
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)

  let compactedState: CompactedMonitorStateWrapper
  try {
    const { env } = await getCloudflareContext({ async: true })
    compactedState = new CompactedMonitorStateWrapper(await getFromStore(env, 'state'))
  } catch (e) {
    // Most likely no monitor_state table: the migrations have not run.
    console.error('Error reading monitor state:', e)
    return res.status(500).send(JSON.stringify({ error: 'Monitor state unavailable' }))
  }

  if (compactedState.data.lastUpdate === 0) {
    return res.status(500).send(JSON.stringify({ error: 'No data available' }))
  }

  const monitors: Record<string, unknown> = {}

  for (const monitor of workerConfig.monitors) {
    const lastIncident = compactedState.getIncident(
      monitor.id,
      compactedState.incidentLen(monitor.id) - 1
    )

    const isUp = lastIncident?.end !== null
    const latency = compactedState.getLastLatency(monitor.id)
    monitors[monitor.id] = {
      up: isUp,
      latency: latency.ping,
      location: latency.loc,
      message: isUp ? 'OK' : lastIncident?.error[lastIncident.error.length - 1],
    }
  }

  const ret = {
    up: compactedState.data.overallUp,
    down: compactedState.data.overallDown,
    updatedAt: compactedState.data.lastUpdate,
    monitors,
    maintenances,
  }

  return res.status(200).send(JSON.stringify(ret))
}
