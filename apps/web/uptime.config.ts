// This is a simplified example config file for quickstart
// Some not frequently used features are omitted/commented out here
// For a full-featured example, please refer to `uptime.config.full.ts`

// Don't edit this line
import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'
import { SITE_NAME, SOURCE_URL } from './lib/site'

const pageConfig: PageConfig = {
  // Title for your status page (lib/site.ts)
  title: SITE_NAME,
  // Links shown at the header of your status page, could set `highlight` to `true`
  links: [{ link: SOURCE_URL, label: 'GitHub' }],
}

const workerConfig: WorkerConfig = {
  // Write the state to D1 at most every N minutes, unless a status changed
  kvWriteCooldownMinutes: 3,
  // Define all your monitors here. These three are public services, so a new
  // status page has something to check before you point it at your own.
  monitors: [
    // Example HTTP Monitor
    {
      // `id` should be unique, history will be kept if the `id` remains constant
      id: 'cloudflare',
      // `name` is used at status page and callback message
      name: 'Cloudflare',
      // `method` should be a valid HTTP Method
      method: 'GET',
      // `target` is a valid URL
      target: 'https://www.cloudflare.com/',
      // [OPTIONAL] `tooltip` is ONLY used at status page to show a tooltip
      tooltip: 'Checked every minute from the Worker',
      // [OPTIONAL] `statusPageLink` is ONLY used for clickable link at status page
      statusPageLink: 'https://www.cloudflarestatus.com/',
      // [OPTIONAL] `expectedCodes` is an array of acceptable HTTP response codes, if not specified, default to 2xx
      // expectedCodes: [200],
      // [OPTIONAL] `timeout` in millisecond, if not specified, default to 10000
      timeout: 10000,
      // [OPTIONAL] headers to be sent
      // headers: {
      //   'User-Agent': 'UptimeFlare',
      //   Authorization: 'Bearer YOUR_TOKEN_HERE',
      // },
      // [OPTIONAL] body to be sent (require POST/PUT/PATCH method)
      // body: 'Hello, world!',
      // [OPTIONAL] if specified, the response must contains the keyword to be considered as operational.
      // responseKeyword: 'success',
      // [OPTIONAL] if specified, the response must NOT contains the keyword to be considered as operational.
      // responseForbiddenKeyword: 'bad gateway',
      // [OPTIONAL] if specified, will call the check proxy to check the monitor, mainly for geo-specific checks
      // currently supports `globalping://` and `http(s)://` proxies (`worker://`, a Durable Object, is not part of this port)
      // checkProxy: 'globalping://YOUR_TOKEN?magic=Europe',
      // [OPTIONAL] if true, the check will fallback to local if the specified proxy is down
      // checkProxyFallback: true,
    },
    {
      id: 'github',
      name: 'GitHub',
      method: 'GET',
      target: 'https://github.com/',
      statusPageLink: 'https://www.githubstatus.com/',
      timeout: 10000,
    },
    // Example TCP Monitor
    {
      id: 'google_dns_tcp',
      name: 'Google Public DNS (TCP 53)',
      // `method` should be `TCP_PING` for tcp monitors
      method: 'TCP_PING',
      // `target` should be `host:port` for tcp monitors
      target: '8.8.8.8:53',
      tooltip: 'A TCP connect to port 53',
      timeout: 5000,
    },
  ],
  // [Optional] Notification settings
  // notification: {
  //   // [Optional] Notification webhook settings, if not specified, no notification will be sent
  //   // More info at Wiki: https://github.com/lyc8503/UptimeFlare/wiki/Setup-notification
  //   webhook: {
  //     // [Required] webhook URL (example: Telegram Bot API)
  //     url: 'https://api.telegram.org/bot123456:ABCDEF/sendMessage',
  //     // [Required] Specify how to encode the payload
  //     // Should be one of 'param', 'json' or 'x-www-form-urlencoded'
  //     payloadType: 'x-www-form-urlencoded',
  //     // [Required] payload to be sent
  //     // $MSG will be replaced with the human-readable notification message
  //     payload: {
  //       chat_id: 12345678,
  //       text: '$MSG',
  //     },
  //     // [Optional] timeout calling this webhook, in millisecond, default to 5000
  //     timeout: 10000,
  //   },
  //   // [Optional] timezone used in notification messages, default to "Etc/GMT"
  //   timeZone: 'Asia/Shanghai',
  //   // [Optional] grace period in minutes before sending a notification
  //   gracePeriod: 5,
  // },
}

// You can define multiple maintenances here
// During maintenance, an alert will be shown at status page
// Also, related downtime notifications will be skipped (if any)
// Of course, you can leave it empty if you don't need this feature
//
// {
//   // [Optional] Monitor IDs to be affected by this maintenance
//   monitors: ['cloudflare', 'github'],
//   // [Optional] default to "Scheduled Maintenance" if not specified
//   title: 'Test Maintenance',
//   // Description of the maintenance, will be shown at status page
//   body: 'This is a test maintenance, server software upgrade',
//   // Start time of the maintenance, in UNIX timestamp or ISO 8601 format
//   start: '2020-01-01T00:00:00+08:00',
//   // [Optional] end time of the maintenance, in UNIX timestamp or ISO 8601 format
//   // if not specified, the maintenance will be considered as on-going
//   end: '2050-01-01T00:00:00+08:00',
//   // [Optional] color of the maintenance alert at status page, default to "yellow"
//   color: 'blue',
// },
const maintenances: MaintenanceConfig[] = []

// Don't edit this line
export { maintenances, pageConfig, workerConfig }
