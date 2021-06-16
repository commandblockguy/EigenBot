import request from 'request'

let jira, client, config

export default (_client, _config, _jira) => {
  client = _client
  config = _config
  jira = _jira
  client.on('message', msg => onMessage(msg))
}

function onMessage (msg) {
  const escapedPrefix = config.prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regexPattern = new RegExp(escapedPrefix + '(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}', 'gi')
  const urlRegex = /https?:\/\/bugs.mojang.com\/browse\/(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}/gi
  // We don't want our bot to react to other bots or itself
  if (msg.author.bot) {
    return
  }
  // help: Gives usage information
  if (msg.content.startsWith(config.prefix + 'help')) {
    sendHelp(msg.channel)
    return
  }

  // upcoming: Checks for fixes in unreleased snapshots
  if (msg.content.startsWith(config.prefix + 'upcoming')) {
    sendUpcoming(msg)
    return
  }

  // mcstatus: Checks Mojang server status
  if (msg.content.startsWith(config.prefix + 'mcstatus')) {
    sendStatus(msg.channel)
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
  matches = matches.filter(function (elem, index, self) { return self.indexOf(elem) === index })
  if (matches.length) {
    // Get a list of issues by issue key
    matches.forEach(function (issueKey, index) {
      jira.findIssue(issueKey).then(function (issue) {
        // Send info about the bug in the form of an embed to the Discord channel
        sendEmbed(msg.channel, issue)
      }).catch(function (error) {
        if (error && error.error && error.error.errorMessages && error.error.errorMessages.includes('Issue Does Not Exist')) {
          msg.channel.send('No issue was found for ' + issueKey + '.')
        } else {
          msg.channel.send('An unknown error has occurred.')
          console.log(error)
        }
      })
    })
  }
}

function sendHelp (channel) {
  channel.send({embed: {
    title: config.prefix + 'help',
    description: 'I listen for Minecraft bug report links or ' + config.prefix + 'PROJECT-NUMBER\n' +
           'For example, saying https://bugs.mojang.com/browse/MC-81098 or ' + config.prefix + 'MC-81098 will give quick info on those bugs',
    fields: [
      {
        name: 'Other commands: ',
        value: '**' + config.prefix + 'help:** Shows this help screen.\n' +
             '**' + config.prefix + 'mcstatus:** Checks Mojang server status.'
      }
    ],
    url: config.url,
    color: 9441545,
    footer: {
      text: config.name
    }
  }})
}

function sendUpcoming (msg) {
  let project = 'MC'

  const args = msg.content.split(' ')
  if (args.length > 1) {
    const projects = /^(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)$/gi
    if (projects.test(args[1])) {
      project = args[1].toUpperCase()
    } else {
      msg.channel.send('Invalid project ID.')
    }
  }

  let done = false
  const search = 'project = ' + project + ' AND fixVersion in unreleasedVersions() ORDER BY resolved DESC'
  jira.searchJira(search).then(function (results) {
    if (!results.issues || !results.issues.length) {
      msg.channel.send('No upcoming bugfixes were found.')
      done = true
      return
    }

    function addLine (issues, response) {
      // Get the next issue, if it exists
      const iter = issues.next()
      if (iter.done) {
        // Otherwise, send the final message
        msg.channel.send(response).catch(function (error) {
          console.log(error)
          msg.channel.send('An error has occurred.')
        })
        done = true
        return
      }
      const issue = iter.value

      // Add the key and title for each bug
      const line = '**' + issue.key + '**: *' + issue.fields.summary.trim() + '*\n'

      // If this line would make the message too long, split into multiple messages
      if (response.length + line.length >= 2000) {
        msg.channel.send(response).then(function () {
          addLine(issues, line)
        }).catch(function (error) {
          console.log(error)
          msg.channel.send('An error has occurred.')
        })
      } else {
        addLine(issues, response + line)
      }
    }

    addLine(results.issues[Symbol.iterator](), 'The following bugs will likely be fixed in the next snapshot: \n')
    done = true
  }).catch(function (error) {
    msg.channel.send('An error has occurred.')
    console.log('Error when processing upcoming command:')
    console.log(error)
    done = true
  })

  setTimeout(() => {
    if (!done) msg.channel.send('Searching for upcoming bugfixes, please wait...')
  }, 500)
}

function sendStatus (channel) {
  // Request json object with the status of services
  request('https://status.mojang.com/check', (error, response, body) => {
    // We really should never get this. If you are getting this, please verify that Mojang still exists.
    if (error) {
      channel.send("Unable to reach Mojang API for status check. Let's assume everything went wrong.")
      return
    }
    // Gives a list of objects with a single key-value pair consisting of the service name as the key and status as a color green, yellow, or red as the value
    const statuses = JSON.parse(body)
    if (statuses.every(function (service) {
      // Get service name
      const name = Object.keys(service)[0]
      if (service[name] === 'green') {
        // Service is healthy
        return true
      } else {
        channel.send('Service ' + name + ' has status ' + service[name])
        return false
      }
    })) {
      // Run only
      channel.send('All services are working normally.')
    }
  })
}

// Send info about the bug in the form of an embed to the Discord channel
function sendEmbed (channel, issue) {
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
  // Create the embed
  const msg = {embed: {
    title: issue.key + ': ' + issue.fields.summary,
    url: 'https://bugs.mojang.com/browse/' + issue.key,
    description: descriptionString,
    color: color,
    timestamp: new Date(Date.parse(issue.fields.created)),
    footer: {
      text: 'Created'
    }
  }}
  channel.send(msg)
}
