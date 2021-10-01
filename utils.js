export function replyNoMention(interaction, response) {
    if (typeof response === 'object') {
        response.allowedMentions = {repliedUser: false}
    } else {
        response = {content: response, allowedMentions: {repliedUser: false}}
    }
    return interaction.deferred ? interaction.editReply(response) : interaction.reply(response)
}

export function editNoMention(msg, response) {
    if (typeof response === 'object') {
        response.allowedMentions = {repliedUser: false}
    } else {
        response = {content: response, allowedMentions: {repliedUser: false}}
    }
    return msg.edit(response)
}