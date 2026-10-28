import '@mantine/core/styles.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { MantineProvider } from '@mantine/core'
import NoSsr from '@/components/NoSsr'
import { pageConfig } from '@/uptime.config'
import '@/util/i18n'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* The title outside NoSsr, so the server-rendered page carries it too
          (upstream sets it only once the page renders in the browser). */}
      <Head>
        <title>{pageConfig.title}</title>
      </Head>
      <NoSsr>
        <MantineProvider defaultColorScheme="auto">
          <Component {...pageProps} />
        </MantineProvider>
      </NoSsr>
    </>
  )
}
