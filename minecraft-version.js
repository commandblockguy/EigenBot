const request = require('request-promise-native')

let client, config

module.exports = (_client, _config) => {
  client = _client
  config = _config['minecraft-version']
  if (!config) return
  if (config.webhook || config.channels) {
    const state = {}
    setInterval(poll.bind(state), (config.interval || 10) * 1000)
  }
}

async function poll() {
  try {
    const data = await request('https://launchermeta.mojang.com/mc/game/version_manifest.json', { json: true })
    const latestDate = data.versions.map(v => Date.parse(v.time)).reduce((a, b) => a > b ? a : b)
    if (this.latestDate === undefined) {
      this.latestRelease = data.latest.release
      this.latestSnapshot = data.latest.snapshot
      this.latestDate = latestDate

      // TESTING
      update(data.versions.find(v => v.id === data.latest.snapshot), false)
      return
    }
    if (latestDate < this.latestDate) return
    this.latestDate = latestDate
    if (this.latestRelease !== data.latest.release) {
      this.latestRelease = data.latest.release
      this.latestSnapshot = data.latest.snapshot
      update(data.versions.find(v => v.id === data.latest.release))
    } else if (this.latestSnapshot !== data.latest.snapshot) {
      this.latestSnapshot = data.latest.snapshot
      update(data.versions.find(v => v.id === data.latest.snapshot))
    }
  } catch (e) {
    console.error(e)
  }
}

const fancySize = size => {
  const mbs = size / (1024 * 1204)
  return mbs.toFixed(1) + 'MB'
}

async function update (version, test) {
  const details = await request(version.url, { json: true })
  const fields = {
    Type: version.type[0].toUpperCase() + version.type.slice(1),
    'Version JSON': `[${version.id}.json](${version.url})`,
    Assets: `[${details.assetIndex.id}](${details.assetIndex.url})`
  }
  const articleUrl = 'https://minecraft.net/en-us/article/minecraft-' + (version.type === 'snapshot' ? 'snapshot-' + version.id.slice(0, -1) + 'a' : version.id)
  try {
    const html = await request(articleUrl)
    const match = html.match(/<p class="lead(?: text-center)?">([^<]*?)<\/p>/)
    if (match) {
      const subtitle = match[1].trim()
      fields.Changelog = `[${subtitle}](${articleUrl})`
    } else {
      fields.Changelog = `[minecraft.net](${articleUrl})`
    }
  } catch (e) {}
  const jars = `[Server JAR](${details.downloads.server.url}) (${fancySize(details.downloads.server.size)}) - [Client JAR](${details.downloads.client.url}) (${fancySize(details.downloads.client.size)})`
  const embeds = [{
    title: `Minecraft ${version.id}`,
    url: version.url,
    description: Object.keys(fields).map(k => `**${k}**: ${fields[k]}`).join('\n') + '\n\n' + jars,
    timestamp: version.releaseTime
  }]
  if (test) {
    console.log(embeds)
    return
  }
  if (config.webhook) await request.post(config.webhook, {json: {embeds}})
  if (config.channels) {
    for (const id of config.channels) {
      const channel = await client.channels.fetch(id)
      await channel.send({embed: embeds[0]})
    }
  }
}
