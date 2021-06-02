import fs from 'fs'
import JiraApi from 'jira-client'
import { Client } from 'discord.js'

const config = JSON.parse(fs.readFileSync('./config.json'))
const client = new Client()

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  // Set the presence for the bot (Listening to !help)
  client.user.setPresence({
    status: 'online',
    game: {
      name: config.prefix + 'help',
      type: 2
    }
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

for (const module of ['eigenbot', 'minecraft-version']) {
  import('./' + module + '.js').then(m => m.default(client, config, jira))
}

// Login with token
client.login(config.token)
