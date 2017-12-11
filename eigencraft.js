const config = require('./config.json');
const regexPattern = /!(mc|mcapi|mcce|mcds|mcl|mcpe|realms|sc|web)-[0-9]{1,}/gi;

const Discord = require('discord.js');
const client = new Discord.Client();

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
	if(msg.author.id === client.user.id) {
		return;
	}
	matches = msg.content.match(regexPattern);
	if(matches === null) {
		return;
	}
	msg.channel.send(matches.map(match => {
		const tmp = match.split('-');
		return 'https://bugs.mojang.com/browse/' + tmp[0].substr(1).toUpperCase() + '-' + tmp[1];
	}).join(' '));
});

client.login(config.token);
