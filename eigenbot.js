const config = require('./config.json');
const regexPattern = /!(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}/gi;
const urlRegex = /https:\/\/bugs.mojang.com\/browse\/(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}/gi;

const Discord = require('discord.js');
const client = new Discord.Client();

var request = require('request');
JiraApi = require('jira').JiraApi;
var jira = new JiraApi('https', config.host, config.port, config.user, config.password, '2', true);

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
	if(msg.author.bot) {
		return;
	}
	matches = msg.content.match(regexPattern);
	if(matches) {
		matches.forEach(function(match) {
			jira.findIssue(match.slice(1), function(error, issue) {
				if(error) {
					msg.channel.send("No issue was found.");
				} else {
					sendEmbed(msg.channel, issue)
				}
			});
		});
	}
	if(urlRegex.test(msg.content)) {
		const issueKey = msg.content.split('/')[4];
		jira.findIssue(issueKey, function(error, issue) {
			if(error) {
				return;
			} else {
				sendEmbed(msg.channel, issue);
			}
		});
	}
});

function sendEmbed(channel, issue) {
	var msg = {embed: {
		title: issue.key + ': ' + issue.fields.summary,
		url: 'https://bugs.mojang.com/browse/' + issue.key,
		description: '**Status:** ' + issue.fields.status.name + ' | **Votes:** ' + issue.fields.votes.votes,
		color: 9441545,
		timestamp: new Date(Date.parse(issue.fields.created)),
		footer: {
			text: "Created"
		}
	}};
	channel.send(msg);
};

client.login(config.token);
