const config = require('./config.json');
const escaped_prefix = config.prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
const regexPattern = new RegExp(escaped_prefix + '(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}', 'gi');
const urlRegex = /https?:\/\/bugs.mojang.com\/browse\/(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,7}/gi;

const request = require('request');

const Discord = require('discord.js');
const client = new Discord.Client();

JiraApi = require('jira-client');
var jira = new JiraApi({
	protocol: 'https',
	host: config.host,
	port: 443,
	username: config.user,
	password: config.password,
	apiVersion: '2',
	strictSSL: true
});

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	//Set the presence for the bot (Listening to !help)
	client.user.setPresence({ status: 'online', game: { name: config.prefix + "help", type: 2} });
});

client.on('message', msg => {
	//We don't want our bot to react to other bots or itself
	if(msg.author.bot) {
		return;
	}
	//help: Gives usage information
	if(msg.content.startsWith(config.prefix + "help")) {
		msg.channel.send({embed: {
			title: config.prefix + "help",
			description: "I listen for Minecraft bug report links or " + config.prefix + "PROJECT-NUMBER\n" +
						 "For example, saying https://bugs.mojang.com/browse/MC-81098 or " + config.prefix + "MC-81098 will give quick info on those bugs",
			fields: [
				{
					name: "Other commands: ",
					value: "**" + config.prefix + "help:** Shows this help screen.\n" +
					       "**" + config.prefix + "mcstatus:** Checks Mojang server status."
				}
			],
			url: config.url,
			color: 9441545,
			footer: {
				text: config.name
			}
		}});
	}
	//mcstatus: Checks Mojang server status
	if(msg.content.startsWith(config.prefix + "mcstatus")) {
		//Request json object with the status of services
		request('https://status.mojang.com/check', function (error, response, body) {
			//We really should never get this. If you are getting this, please verify that Mojang still exists.
			if(error) {
				msg.channel.send("Unable to reach Mojang API for status check. Let's assume everything went wrong.");
				return;
			}
			//Gives a list of objects with a single key-value pair consisting of the service name as the key and status as a color green, yellow, or red as the value
			const statuses = JSON.parse(body);
			if(statuses.every(function(service) {
				//Get service name
				name = Object.keys(service)[0];
				if(service[name] == 'green') {
					//Service is healthy
					return true;
				} else {
					msg.channel.send("Service " + name + " has status " + service[name]);
					return false;
				}
			})) {
				//Run only
				msg.channel.send("All services are working normally.");
			}
		});
	}
	matches = []
	//Check for prefixed issue keys (!MC-1)
	piks = msg.content.match(regexPattern)
	if(piks) matches = piks.map(function(prefixedIssueKey) {
		return prefixedIssueKey.slice(config.prefix.length);
	});
	//Check for bugs.mojang.com urls
	urls = msg.content.match(urlRegex)
	if(urls) matches = matches.concat(urls.map(function(url) {
		return url.split('/')[4];
	}));
	matches = matches.filter(function(elem, index, self){ return self.indexOf(elem) === index });
	if(matches.length) {
		//Get a list of issues by issue key
		matches.forEach(function(issueKey, index) {
			jira.findIssue(issueKey).then(function(issue) {
				//Send info about the bug in the form of an embed to the Discord channel
				sendEmbed(msg.channel, issue);
			}).catch(function(error) {
				if(error && error.error && error.error.errorMessages && error.error.errorMessages.includes('Issue Does Not Exist')) {
					msg.channel.send("No issue was found for " + issueKey + ".");
				} else {
					msg.channel.send("An unknown error has occurred.");
					console.log(error);
				}
			});
		});
	}
});

//Send info about the bug in the form of an embed to the Discord channel
function sendEmbed(channel, issue) {
	descriptionString = '**Status:** ' + issue.fields.status.name
	if(!issue.fields.resolution) {
		//For unresolved issues
		descriptionString += ' | **Votes:** ' + issue.fields.votes.votes;
	} else {
		//For resolved issues
		descriptionString += ' | **Resolution:** ' + issue.fields.resolution.name;
	}
	//Generate the message
	//Pick a color based on the status
	color = config.colors[issue.fields.status.name];
	//Additional colors for different resolutions
	if(issue.fields.resolution && ["Invalid", "Duplicate", "Incomplete", "Cannot Reproduce"].includes(issue.fields.resolution.name)) {
		color = config.colors["Invalid"];
	} else if(issue.fields.resolution && ["Won't Fix", "Works As Intended"].includes(issue.fields.resolution.name)) {
		color = config.colors["Working"];
	}
	//Create the embed
	var msg = {embed: {
		title: issue.key + ': ' + issue.fields.summary,
		url: 'https://bugs.mojang.com/browse/' + issue.key,
		description: descriptionString,
		color: color,
		timestamp: new Date(Date.parse(issue.fields.created)),
		footer: {
			text: "Created"
		}
	}};
	channel.send(msg);
};

//Login with token
client.login(config.token);
