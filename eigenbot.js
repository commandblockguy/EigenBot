import fetch from 'node-fetch'
import {replyNoMention, editNoMention} from './utils.js'
import {SlashCommandBuilder} from '@discordjs/builders'

const PROJECTS = ['MC', 'MCAPI', 'MCCE', 'MCD', 'MCL', 'MCPE', 'REALMS', 'BDS', 'WEB']

let jira, client, config

export default (_client, _config, _jira) => {
  client = _client
  config = _config
  jira = _jira
  client.on('messageCreate', onMessage)
  client.on('interactionCreate', onInteraction)
  return [
    new SlashCommandBuilder().setName('upcoming').setDescription('Shows bugs that are likely fixed in the next snapshot')
      .addStringOption(option => option.setName('project').setDescription('The project to search in, for example "MC"')),
    new SlashCommandBuilder().setName('mcstatus').setDescription('Checks Mojang server status'),
    new SlashCommandBuilder().setName('bug').setDescription('Shows information for a bug')
      .addStringOption(option => option.setName('id').setDescription('The bug id (for example MC-88959)'))
  ]
}

function onInteraction(interaction) {
  if (!interaction.isCommand()) return
  switch(interaction.commandName) {
    case 'upcoming': return sendUpcoming(interaction, interaction.options.getString('project'))
    case 'mcstatus': return sendStatus(interaction)
    case 'bug': {
      const key = interaction.options.getString('id')
      const dash = key.indexOf('-')
      const bugNumber = key.substr(dash + 1)
      if (dash < 0 || parseInt(bugNumber).toString() !== bugNumber) {
        replyNoMention(interaction, 'Invalid issue id')
        return
      }
      if (!PROJECTS.includes(key.substr(0, dash))) {
        replyNoMention(interaction, 'Unknown project')
        return
      }
      return respondWithIssue(interaction, key)
    }
  }
}


function onMessage (msg) {
  const escapedPrefix = config.prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regexPattern = new RegExp(escapedPrefix + '(' + PROJECTS.join('|') + ')-[0-9]{1,7}', 'gi')
  const urlRegex = new RegExp('https?:\/\/bugs.mojang.com\/browse\/(' + PROJECTS.join('|') + ')-[0-9]{1,7}', 'gi')
  // We don't want our bot to react to other bots or itself
  if (msg.author.bot) {
    return
  }
  // help: Gives usage information
  if (msg.content.startsWith(config.prefix + 'help')) {
    sendHelp(msg)
    return
  }

  // upcoming: Checks for fixes in unreleased snapshots
  if (msg.content.startsWith(config.prefix + 'upcoming')) {
    let project = 'MC'
    const args = msg.content.split(' ')
    if (args.length > 1) {
      project = args[1].toUpperCase()
    }
    sendUpcoming(msg, project)
    return
  }

  // mcstatus: Checks Mojang server status
  if (msg.content.startsWith(config.prefix + 'mcstatus')) {
    sendStatus(msg)
    return
  }
  let matches = []
  // Check for prefixed issue keys (!MC-1)
  const piks = msg.content.match(regexPattern)
  if (piks) matches = piks.map(prefixedIssueKey => prefixedIssueKey.slice(config.prefix.length))
  // Check for bugs.mojang.com urls
  const urls = msg.content.match(urlRegex)
  if (urls) {
    matches = matches.concat(urls.map(function (url) {
      return url.split('/')[4]
    }))
  }
  for (const issueKey of new Set(matches)) {
    respondWithIssue(msg, issueKey)
  }
}

function respondWithIssue(msg, issueKey) {
  jira.findIssue(issueKey).then(issue =>{
    // Send info about the bug in the form of an embed to the Discord channel
    sendEmbed(msg, issue)
  }).catch(error => {
    if (error && error.error && error.error.errorMessages && error.error.errorMessages.includes('Issue Does Not Exist')) {
      replyNoMention(msg, 'No issue was found for ' + issueKey + '.')
    } else {
      replyNoMention(msg, 'An unknown error has occurred.')
      console.log(error)
    }
  })
}

function sendHelp (interaction) {
  replyNoMention(interaction, {embeds: [{
    title: config.name + ' help',
    description: 'I listen for Minecraft bug report links or ' + config.prefix + 'PROJECT-NUMBER\n' +
           'For example, saying https://bugs.mojang.com/browse/MC-81098 or ' + config.prefix + 'MC-81098 will give quick info on those bugs',
    fields: [
      {
        name: 'Other commands: ',
        value: '**' + config.prefix + 'help:** Shows this help screen.\n' +
             '**' + config.prefix + 'mcstatus:** Checks Mojang server status.\n' +
             '**' + config.prefix + 'upcoming:** Shows bugs that are likely fixed in the next snapshot.'
      }
    ],
    url: config.url,
    color: 9441545,
    footer: {
      text: config.name
    }
  }]})
}

async function sendUpcoming (interaction, project) {
  project = project ? project.toUpperCase() : 'MC'
  if (!PROJECTS.includes(project)) {
    replyNoMention(interaction, 'Invalid project ID.')
    return
  }

  let sendNext = replyNoMention.bind(null, interaction)
  let done = false
  if (interaction.deferReply) {
    await interaction.deferReply()
  } else {
    setTimeout(async () => {
      if (!done) {
        const msg = await replyNoMention(interaction, 'Searching for upcoming bugfixes, please wait...')
        sendNext = editNoMention.bind(null, msg)
      }
    }, 500)
  }
  
  const search = 'project = ' + project + ' AND fixVersion in unreleasedVersions() ORDER BY resolved DESC'
  jira.searchJira(search).then(async function (results) {
    done = true
    if (!results.issues || !results.issues.length) { 
      return replyNoMention(interaction, 'No upcoming bugfixes were found.')
    }

    let messageContent = 'The following bugs will likely be fixed in the next snapshot:'

    async function addLine(line) {
      const newContent = line !== null ? messageContent + '\n' + line : messageContent
      if (newContent.length >= 2000 || line === null) {
        const msg = await sendNext(messageContent)
        sendNext = interaction.followUp ? interaction.followUp.bind(interaction) : msg.reply.bind(msg)
        messageContent = line || ''
      } else {
        messageContent = newContent
      }
    }

    for (const issue of results.issues) {
      await addLine('**' + issue.key + '**: *' + issue.fields.summary.trim() + '*')
    }
    await addLine(null)
  }).catch(function (error) {
    done = true
    replyNoMention(interaction, 'An error has occurred.')
    console.log('Error when processing upcoming command:')
    console.log(error)
  })
}

async function sendStatus (interaction) {
  // Request json object with the status of services
  try {
    if (interaction.deferReply) {
      await interaction.deferReply()
    }
    const res = await fetch('https://status.mojang.com/check')
    const statuses = await res.json()
    const colors = {
      red: 0xff0000,
      yellow: 0x00ffff,
      green: 0x00ff00
    }
    let color = colors.green
    const embed = {
      title: 'Mojang Service Status',
      fields: []
    }
    for (const service of statuses) {
      const name = Object.keys(service)[0]
      embed.fields.push({
        name, value: `:${service[name]}_square: ${service[name]}`, inline: true
      })
      color = Math.max(color, colors[service[name]])
    }
    while (embed.fields.length % 3 !== 0) embed.fields.push({name: '\u200b', value: '\u200b', inline: true})
    embed.color = color
    await replyNoMention(interaction, {embeds: [embed]})
  } catch (e) {
    console.error(e)
    try {
      await replyNoMention(interaction, 'Could not get status from Mojang API')
    } catch (e2) {
      console.error(e2)
    }
  }
}

// Send info about the bug in the form of an embed to the Discord channel
function sendEmbed (interaction, issue) {
  let descriptionString = '**Status:** ' + issue.fields.status.name
  if (!issue.fields.resolution) {
    // For unresolved issues
    descriptionString += ' | **Votes:** ' + issue.fields.votes.votes
  } else {
    // For resolved issues
    descriptionString += ' | **Resolution:** ' + issue.fields.resolution.name
  }
  // Generate the message
  // Pick a color based on the status
  let color = config.colors[issue.fields.status.name]
  // Additional colors for different resolutions
  if (issue.fields.resolution && ['Invalid', 'Duplicate', 'Incomplete', 'Cannot Reproduce'].includes(issue.fields.resolution.name)) {
    color = config.colors['Invalid']
  } else if (issue.fields.resolution && ["Won't Fix", 'Works As Intended'].includes(issue.fields.resolution.name)) {
    color = config.colors['Working']
  }
  replyNoMention(interaction, {embeds: [{
    title: issue.key + ': ' + issue.fields.summary,
    url: 'https://bugs.mojang.com/browse/' + issue.key,
    description: descriptionString,
    color: color,
    timestamp: new Date(Date.parse(issue.fields.created)),
    footer: {
      text: 'Created'
    }
  }]})
}
