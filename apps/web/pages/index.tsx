import Head from 'next/head'

import { Inter } from 'next/font/google'
import { MonitorTarget } from '@/types/config'
import { maintenances, pageConfig } from '@/uptime.config'
import OverallStatus from '@/components/OverallStatus'
import Header from '@/components/Header'
import MonitorList from '@/components/MonitorList'
import { Center, Text } from '@mantine/core'
import MonitorDetail from '@/components/MonitorDetail'
import Footer from '@/components/Footer'
import { useTranslation } from 'react-i18next'
import { CompactedMonitorStateWrapper, getFromStore } from '@/monitor/store'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const inter = Inter({ subsets: ['latin'] })

export default function Home({
  compactedStateStr,
  monitors,
}: {
  compactedStateStr: string
  monitors: MonitorTarget[]
  tooltip?: string
  statusPageLink?: string
}) {
  const { t } = useTranslation('common')
  let state = new CompactedMonitorStateWrapper(compactedStateStr).uncompact()

  // Specify monitorId in URL hash to view a specific monitor (can be used in iframe)
  const monitorId = window.location.hash.substring(1)
  if (monitorId) {
    const monitor = monitors.find((monitor) => monitor.id === monitorId)
    if (!monitor || !state) {
      return <Text fw={700}>{t('Monitor not found', { id: monitorId })}</Text>
    }
    return (
      <div style={{ maxWidth: '810px' }}>
        <MonitorDetail monitor={monitor} state={state} />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{pageConfig.title}</title>
        <link rel="icon" href={pageConfig.favicon ?? '/favicon.png'} />
      </Head>

      <main className={inter.className}>
        <Header />

        {state.lastUpdate === 0 ? (
          <Center>
            <Text fw={700}>{t('Monitor State not defined')}</Text>
          </Center>
        ) : (
          <div>
            <OverallStatus state={state} monitors={monitors} maintenances={maintenances} />
            <MonitorList monitors={monitors} state={state} />
          </div>
        )}

        <Footer />
      </main>
    </>
  )
}

export async function getServerSideProps() {
  const { workerConfig } = await import('@/uptime.config')
  // Read state as string from storage, to avoid hitting server-side cpu time limit.
  // The D1 binding comes from the Worker's env (OpenNext), not process.env.
  const { env } = await getCloudflareContext({ async: true })
  let compactedStateStr: string | null = null
  try {
    compactedStateStr = await getFromStore(env, 'state')
  } catch (e) {
    // No monitor_state table yet (the migrations have not run): the page says
    // "Monitor State not defined", as it does before the first check.
    console.error('Error reading monitor state:', e)
  }

  // Only present these values to client
  const monitors = workerConfig.monitors.map((monitor) => {
    return {
      id: monitor.id,
      name: monitor.name,
      tooltip: monitor?.tooltip,
      statusPageLink: monitor?.statusPageLink,
      hideLatencyChart: monitor?.hideLatencyChart,
    }
  })

  return { props: { compactedStateStr, monitors } }
}
