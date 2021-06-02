const config = require('./config.json')

const JiraApi = require('jira-client')
const Discord = require('discord.js')
const client = new Discord.Client()

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
  require('./' + module)(client, config, jira)
}

// Login with token
client.login(config.token)
