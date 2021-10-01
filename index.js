import fs from 'fs'
import JiraApi from 'jira-client'
import {Client, Intents} from 'discord.js'
import {REST} from '@discordjs/rest'
import {Routes} from 'discord-api-types/v9'

const config = JSON.parse(fs.readFileSync('./config.json'))
const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]})

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  // Set the presence for the bot (Listening to !help)
  client.user.setPresence({
    status: 'online',
    activities: [{
      name: config.prefix + 'help',
      type: 'LISTENING'
    }]
  })
})

const jira = new JiraApi({
  protocol: 'https',
  host: config.host,
  port: 443,
  username: config.user,
  password: config.password,
  apiVersion: '2',
  strictSSL: true
})

;(async () => {
  const commands = []
  for (const module of ['eigenbot', 'minecraft-version']) {
    const m = await import('./' + module + '.js')
    const moduleCommands = (await m.default(client, config, jira)) || []
    for (const command of moduleCommands) {
      if (command.toJSON) {
        commands.push(command.toJSON())
      } else {
        commands.push(command)
      }
    }
  }

  if (!commands.length) return
  const rest = new REST({version: '9'}).setToken(config.token)
  client.on('ready', () => {
    const clientId = client.application.id
    rest.put(
      config.guild
        ? Routes.applicationGuildCommands(clientId, config.guild)
        : Routes.applicationCommands(clientId),
      {body: commands}
    )
  })

  // Login with token
  client.login(config.token)
})()
