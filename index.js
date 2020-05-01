const config = require('./config.json');

const Discord = require('discord.js');
const client = new Discord.Client();

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	//Set the presence for the bot (Listening to !help)
	client.user.setPresence({
    status: 'online',
    game: {
      name: config.prefix + "help",
      type: 2
    }
  })
})

require('./eigenbot')(client, config)

//Login with token
client.login(config.token)
