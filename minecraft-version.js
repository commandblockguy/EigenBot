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

async function poll () {
  try {
    const data = await request('https://launchermeta.mojang.com/mc/game/version_manifest.json', { json: true })
    const latestDate = data.versions.map(v => Date.parse(v.time)).reduce((a, b) => a > b ? a : b)
    if (this.latestDate === undefined) {
      this.latestRelease = data.latest.release
      this.latestSnapshot = data.latest.snapshot
      this.latestDate = latestDate

      // TESTING
      // update(data.versions.find(v => v.id === data.latest.snapshot), false)
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
  let thumbnail
  try {
    const {url, image, subtitle} = await getArticle(version)
    if (url) {
      fields.Changelog = `[${subtitle || 'minecraft.net'}](${url})`
      thumbnail = {url: image}
    }
  } catch (e) {}
  const jars = `[Server JAR](${details.downloads.server.url}) (${fancySize(details.downloads.server.size)}) - [Client JAR](${details.downloads.client.url}) (${fancySize(details.downloads.client.size)})`
  const embeds = [{
    title: `Minecraft ${version.id}`,
    url: version.url,
    description: Object.keys(fields).map(k => `**${k}**: ${fields[k]}`).join('\n') + '\n\n' + jars,
    timestamp: version.releaseTime,
    thumbnail
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

async function getArticle (version) {
  const articles = await request('https://www.minecraft.net/content/minecraft-net/_jcr_content.articles.grid', { json: true })
  const candidates = articles.article_grid.filter(article => {
    const title = article.default_tile.title
    if (!title.startsWith('Minecraft ') || title.startsWith('Minecraft Dungeons') || article.default_tile.sub_header.includes('Bedrock Beta')) return false
    if (title.includes(version.id)) return true
    if (version.type !== 'snapshot') return false
    const snapshot = version.id.match(/^(\d{2}w\d{2})([a-z])$/)
    if (snapshot) return title.includes(snapshot[1])
    const match = version.id.match(/^(\d+\.\d+(?:\.\d+)?)(-(rc|pre)(\d+)$)?/)
    if (!match) return false
    switch (match[3]) {
      case 'rc': return title.includes(match[1] + ' Release Candidate')
      case 'pre': return title.includes(match[1] + ' Pre-Release')
      default: return title.includes(version.id)
    }
  })
  const article = candidates[0]
  if (!article) return {}
  const tile = article.default_tile
  return {url: 'https://minecraft.net' + article.article_url, title: tile.title, subtitle: tile.sub_header, image: 'https://minecraft.net' + tile.image.imageURL}
}
