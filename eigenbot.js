const config = require('./config.json');
const regexPattern = /!(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}/gi;
const urlRegex = /https:\/\/bugs.mojang.com\/browse\/(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}/gi;

const request = require('request');

const Discord = require('discord.js');
const client = new Discord.Client();

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
	if(msg.content.startsWith(config.prefix + "help")) {
		msg.channel.send({embed: {
			title: "!help",
			description: "I listen for Minecraft bug report links or " + config.prefix + "PROJECT-NUMBER\n" +
						 "For example, saying https://bugs.mojang.com/browse/MC-81098 or !MC-81098 will give quick info on those bugs",
			fields: [
				{
					name: "Other commands: ",
					value: "**" + config.prefix + "help:** Shows this help screen.\n" +
					       "**" + config.prefix + "mcstatus:** Checks Mojang server status. (Currently unimplemented)"
				}
			],
			url: config.url,
			color: 9441545,
			footer: {
				text: "EigenBot"
			}
		}});
	}
	if(msg.content.startsWith(config.prefix + "mcstatus")) {
		request('https://status.mojang.com/check', function (error, response, body) {
			if(error) {
				msg.channel.send("Unable to reach Mojang API for status check. Let's assume everything went wrong.");
				return;
			}
			const statuses = JSON.parse(body);
			if(statuses.every(function(service) {
				name = Object.keys(service)[0];
				if(service[name] == 'green') {
					return true;
				} else {
					msg.channel.send("Service " + name + " has status " + service[name]);
					return false;
				}
			})) {
				msg.channel.send("All services are working normally.");
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
