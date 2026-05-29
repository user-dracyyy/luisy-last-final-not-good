// =========================
// LOAD ENV
// =========================
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const { OpenAI } = require('openai');

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
    ]
});

// =========================
// GROQ AI SETUP
// =========================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

// =========================
// CONFIG
// =========================
const MASTER_ID = '1279446471200083982';

const PREFIX = '!';
const AFK_PREFIX = '%afk';
const LOG_CHANNEL_NAME = 'mod-logs';

const ALLOWED_ROLE_IDS = [
    '1500554234113036348',
    '1499672505361764372',
    '1499707337580220516',
    '1500544907813585006',
    '1500694454183399524'
];

const GIF_ROLE_ID = [ '1500544907813585006',
                     '1509788464198189137'
                    ];

// =========================
// STORAGE
// =========================
const aiCooldown = new Map();
const chatMemory = new Map();
const afkUsers = new Map();

// =========================
// TIME FORMAT
// =========================
function relativeTime(timestamp) {
    return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

// =========================
// FLEXIBLE TIME PARSER
// =========================
function parseDuration(input) {

    if (!input) return null;

    input = input.toLowerCase().trim();

    const regex =
        /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/g;

    let total = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {

        const value = parseInt(match[1]);
        const unit = match[2];

        if (
            unit === 's' ||
            unit === 'sec' ||
            unit === 'secs' ||
            unit === 'second' ||
            unit === 'seconds'
        ) {
            total += value * 1000;
        }

        else if (
            unit === 'm' ||
            unit === 'min' ||
            unit === 'mins' ||
            unit === 'minute' ||
            unit === 'minutes'
        ) {
            total += value * 60 * 1000;
        }

        else if (
            unit === 'h' ||
            unit === 'hr' ||
            unit === 'hrs' ||
            unit === 'hour' ||
            unit === 'hours'
        ) {
            total += value * 60 * 60 * 1000;
        }

        else if (
            unit === 'd' ||
            unit === 'day' ||
            unit === 'days'
        ) {
            total += value * 24 * 60 * 60 * 1000;
        }
    }

    return total || null;
}

// =========================
// GET TARGET MEMBER
// =========================
async function getTargetMember(message) {

    let target = message.mentions.members.first();

    if (target) return target;

    if (message.reference?.messageId) {

        try {

            const replied =
                await message.channel.messages.fetch(
                    message.reference.messageId
                );

            return replied.member;

        } catch {

            return null;

        }
    }

    return null;
}

// =========================
// MOD PERMISSION CHECK
// =========================
function hasModPermission(message, isMaster) {

    return (
        isMaster ||

        message.member.permissions.has(
            PermissionsBitField.Flags.Administrator
        ) ||

        message.member.roles.cache.some(role =>
            ALLOWED_ROLE_IDS.includes(role.id)
        )
    );
}

// =========================
// EMBED MAKER
// =========================
function makeEmbed({
    color,
    title,
    moderator,
    reason,
    target,
    duration
}) {

    const embed = new EmbedBuilder()
        .setColor(color)
        .setThumbnail(target.displayAvatarURL())
        .setTitle(title)
        .setDescription(
            [
                `👤 **User:** ${target.username}`,
                `🛡️ **By:** ${moderator}`,
                duration
                    ? `⏳ **Duration:** ${duration}`
                    : null,
                '',
                `📄 **Reason:** ${reason}`
            ]
                .filter(Boolean)
                .join('\n')
        )
        .setTimestamp();

    return embed;
}

// =========================
// READY
// =========================
client.once('clientReady', (c) => {

    console.log(`✅ Luisy Online as ${c.user.tag}`);

});

// =========================
// BUTTON INTERACTION
// =========================
client.on('interactionCreate', async (interaction) => {

    try {

        if (!interaction.isButton()) return;

        const [action, userId] =
            interaction.customId.split('_');

        if (
            action !== 'afkyes' &&
            action !== 'afkno'
        ) return;

        if (interaction.user.id !== userId) {

            return interaction.reply({
                content: '❌ This AFK menu is not for you.',
                ephemeral: true
            });
        }

        if (!afkUsers.has(userId)) return;

        const afkData =
            afkUsers.get(userId);

        afkData.dmEnabled =
            action === 'afkyes';

        const finalEmbed =
            new EmbedBuilder()
                .setColor('Blue')
                .setThumbnail(
                    interaction.user.displayAvatarURL()
                )
                .setDescription(
                    `➜ **${interaction.user.username}** is AFK now!\n╰┈> **Reason:** ${afkData.reason}`
                );

        await interaction.update({
            embeds: [finalEmbed],
            components: []
        });

    } catch (err) {

        console.error(err);

    }
});

// =========================
// MAIN MESSAGE EVENT
// =========================
client.on('messageCreate', async (message) => {

    try {

        if (
            message.author.bot ||
            !message.guild
        ) return;

        const content =
            message.content;

        const lower =
            content.toLowerCase();

        const isMaster =
            message.author.id === MASTER_ID;

        const hasPermission =
            hasModPermission(
                message,
                isMaster
            );

        // =========================
        // REMOVE AFK
        // =========================
        if (
            afkUsers.has(
                message.author.id
            )
        ) {

            const afkData =
                afkUsers.get(
                    message.author.id
                );

            afkUsers.delete(
                message.author.id
            );

            await message.reply(
                `👋 Welcome back **${message.author.username}**!\nYou were AFK since ${relativeTime(afkData.since)}`
            );
        }

        // =========================
        // AFK REPLY DETECTION
        // =========================
        if (message.reference?.messageId) {

            try {

                const repliedMessage =
                    await message.channel.messages.fetch(
                        message.reference.messageId
                    );

                if (
                    afkUsers.has(
                        repliedMessage.author.id
                    )
                ) {

                    const afkData =
                        afkUsers.get(
                            repliedMessage.author.id
                        );

                    await message.reply(
                        `${repliedMessage.author.username} has been AFK since ${relativeTime(afkData.since)} for — ${afkData.reason}`
                    );

                    if (afkData.dmEnabled) {

                        const dmEmbed =
                            new EmbedBuilder()
                                .setColor('Blue')
                                .setThumbnail(
                                    repliedMessage.author.displayAvatarURL()
                                )
                                .setTitle(
                                    'AFK Mention Alert'
                                )
                                .setDescription(
                                    `You were mentioned by ${message.author}\n\n💬 **Message:**\n> ${message.content}`
                                );

                        const row =
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setLabel('Jump to Message')
                                        .setStyle(ButtonStyle.Link)
                                        .setURL(message.url)
                                );

                        await repliedMessage.author.send({
                            embeds: [dmEmbed],
                            components: [row]
                        }).catch(() => { });
                    }
                }

            } catch (err) {

                console.error(err);

            }
        }

        // =========================
        // AFK COMMAND
        // =========================
        if (
            lower.startsWith(AFK_PREFIX)
        ) {

            const reason =
                content
                    .slice(AFK_PREFIX.length)
                    .trim() ||
                'No reason provided';

            afkUsers.set(
                message.author.id,
                {
                    reason,
                    since: Date.now(),
                    dmEnabled: false,
                }
            );

            const embed =
                new EmbedBuilder()
                    .setColor('Blue')
                    .setThumbnail(
                        message.author.displayAvatarURL()
                    )
                    .setTitle('AFK Enabled')
                    .setDescription(
                        `📝 **Reason:** ${reason}\n\nWould you like DM alerts for mentions?`
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `afkyes_${message.author.id}`
                            )
                            .setLabel('Yes')
                            .setStyle(ButtonStyle.Success),

                        new ButtonBuilder()
                            .setCustomId(
                                `afkno_${message.author.id}`
                            )
                            .setLabel('No')
                            .setStyle(ButtonStyle.Danger)
                    );

            return message.reply({
                embeds: [embed],
                components: [row]
            });
        }

        // =========================
        // WARN
        // =========================
        if (
            lower.startsWith('!!warn')
        ) {

            if (!hasPermission) return;

            const target =
                await getTargetMember(message);

            if (!target) {
                return message.reply(
                    '❌ User not found.'
                );
            }

            let reason;

            if (
                message.mentions.members.first()
            ) {

                reason =
                    content
                        .split(' ')
                        .slice(2)
                        .join(' ');

            } else {

                reason =
                    content
                        .split(' ')
                        .slice(1)
                        .join(' ');
            }

            if (!reason)
                reason = 'No reason provided';

            const serverEmbed =
                makeEmbed({
                    color: 'Red',
                    title: '⚠️ Warning',
                    moderator: message.author.id,
                    reason,
                    target: target.user
                });

            const dmEmbed =
                makeEmbed({
                    color: 'Red',
                    title: '⚠️ Warning',
                    moderator: `${message.author}`,
                    reason,
                    target: target.user
                });

            await message.reply({
                embeds: [serverEmbed]
            });

            await target.send({
                embeds: [dmEmbed]
            }).catch(() => { });

            return;
        }

        // =========================
        // KICK
        // =========================
        if (
            lower.startsWith('!!kick')
        ) {

            if (!hasPermission) return;

            const target =
                await getTargetMember(message);

            if (!target) {
                return message.reply(
                    '❌ User not found.'
                );
            }

            let reason;

            if (
                message.mentions.members.first()
            ) {

                reason =
                    content
                        .split(' ')
                        .slice(2)
                        .join(' ');

            } else {

                reason =
                    content
                        .split(' ')
                        .slice(1)
                        .join(' ');
            }

            if (!reason)
                reason = 'No reason provided';

            const dmEmbed =
                makeEmbed({
                    color: 'Orange',
                    title: '👢 Kicked',
                    moderator: `${message.author}`,
                    reason,
                    target: target.user
                });

            await target.send({
                embeds: [dmEmbed]
            }).catch(() => { });

            await target.kick(reason);

            return message.reply(
                `👢 ${target.user.username} has been kicked.`
            );
        }

        // =========================
        // TEMP BAN
        // =========================
        if (
            lower.startsWith('!!t.ban')
        ) {

            if (!hasPermission) return;

            const target =
                await getTargetMember(message);

            if (!target) {
                return message.reply(
                    '❌ User not found.'
                );
            }

            const args =
                content.split(' ');

            let duration;
            let reason;

            if (
                message.mentions.members.first()
            ) {

                duration = args[2];
                reason =
                    args
                        .slice(3)
                        .join(' ');

            } else {

                duration = args[1];
                reason =
                    args
                        .slice(2)
                        .join(' ');
            }

            const durationMs =
                parseDuration(duration);

            if (!durationMs) {

                return message.reply(
                    '❌ Invalid duration.\nExamples: 10m, 2h, 1d, 30sec'
                );
            }

            if (!reason)
                reason = 'No reason provided';

            const serverEmbed =
                makeEmbed({
                    color: 'DarkRed',
                    title: '⛔ Temporary Ban',
                    moderator: message.author.id,
                    reason,
                    target: target.user,
                    duration
                });

            const dmEmbed =
                makeEmbed({
                    color: 'DarkRed',
                    title: '⛔ Temporary Ban',
                    moderator: `${message.author}`,
                    reason,
                    target: target.user,
                    duration
                });

            await message.reply({
                embeds: [serverEmbed]
            });

            await target.send({
                embeds: [dmEmbed]
            }).catch(() => { });

            await target.ban({
                reason
            });

            setTimeout(async () => {

                try {

                    await message.guild.members.unban(
                        target.id
                    );

                } catch { }

            }, durationMs);

            return;
        }

        // =========================
        // PERMANENT BAN
        // =========================
        if (
            lower.startsWith('!!ban')
        ) {

            if (!hasPermission) return;

            const target =
                await getTargetMember(message);

            if (!target) {
                return message.reply(
                    '❌ User not found.'
                );
            }

            let reason;

            if (
                message.mentions.members.first()
            ) {

                reason =
                    content
                        .split(' ')
                        .slice(2)
                        .join(' ');

            } else {

                reason =
                    content
                        .split(' ')
                        .slice(1)
                        .join(' ');
            }

            if (!reason)
                reason = 'No reason provided';

            const serverEmbed =
                makeEmbed({
                    color: 'DarkRed',
                    title: '🔨 Permanent Ban',
                    moderator: message.author.id,
                    reason,
                    target: target.user
                });

            const dmEmbed =
                makeEmbed({
                    color: 'DarkRed',
                    title: '🔨 Permanent Ban',
                    moderator: `${message.author}`,
                    reason,
                    target: target.user
                });

            await message.reply({
                embeds: [serverEmbed]
            });

            await target.send({
                embeds: [dmEmbed]
            }).catch(() => { });

            await target.ban({
                reason
            });

            return;
        }

        // =========================
        // TIMEOUT
        // =========================
        if (
            lower.startsWith('!!timeout')
        ) {

            if (!hasPermission) return;

            const target =
                await getTargetMember(message);

            if (!target) {
                return message.reply(
                    '❌ User not found.'
                );
            }

            const args =
                content.split(' ');

            let duration;
            let reason;

            if (
                message.mentions.members.first()
            ) {

                duration =
                    args[args.length - 1];

                reason =
                    args
                        .slice(2, -1)
                        .join(' ');

            } else {

                duration =
                    args[args.length - 1];

                reason =
                    args
                        .slice(1, -1)
                        .join(' ');
            }

            const durationMs =
                parseDuration(duration);

            if (!durationMs) {

                return message.reply(
                    '❌ Invalid duration.\nExamples: 10m, 2h, 1d, 30sec'
                );
            }

            if (!reason)
                reason = 'No reason provided';

            await target.timeout(
                durationMs,
                reason
            );

            const embed =
                makeEmbed({
                    color: 'Yellow',
                    title: '⏳ Timeout',
                    moderator: message.author.id,
                    reason,
                    target: target.user,
                    duration
                });

            await message.reply({
                embeds: [embed]
            });

            const dmEmbed =
                makeEmbed({
                    color: 'Yellow',
                    title: '⏳ Timeout',
                    moderator: `${message.author}`,
                    reason,
                    target: target.user,
                    duration
                });

            await target.send({
                embeds: [dmEmbed]
            }).catch(() => { });

            return;
        }

        // =========================
        // NICKNAME
        // =========================
        if (
            lower.startsWith('!!nick')
        ) {

            if (!hasPermission) return;

            const target =
                message.mentions.members.first();

            if (!target) {

                return message.reply(
                    '❌ Mention a user.'
                );
            }

            const nickname =
                content
                    .split(' ')
                    .slice(2)
                    .join(' ');

            if (!nickname) {

                return message.reply(
                    '❌ Provide nickname.'
                );
            }

            await target.setNickname(
                nickname
            );

            return message.reply(
                `✏️ Nickname changed to **${nickname}**`
            );
        }

        // =========================
        // GIF SYSTEM
        // =========================
        const isGif =
            content.includes('tenor.com') ||
            content.includes('giphy.com') ||
            content.includes('.gif');

        if (isGif) {

            const hasGifPerms =
                message.member.roles.cache.has(
                    GIF_ROLE_ID
                );

            if (!hasGifPerms) {

                try {

                    await message.delete();

                } catch { }

                return message.channel.send(
                    `<@${message.author.id}> , Holly aura loss💀`
                );
            }
        }

        // =========================
        // PING
        // =========================
        if (
            lower.startsWith(`${PREFIX}ping`)
        ) {

            return message.reply(
                `🏓 Pong! ${client.ws.ping}ms`
            );
        }

        // =========================
        // DELETE
        // =========================
        if (
            lower.startsWith(`${PREFIX}delete`)
        ) {

            if (!hasPermission) {

                return message.reply(
                    '❌ You do not have permission.'
                );
            }

            try {

                const args =
                    lower.split(' ');

                let amount =
                    parseInt(args[1]) || 5;

                if (amount > 100)
                    amount = 100;

                if (amount < 1)
                    amount = 1;

                const fetched =
                    await message.channel.messages.fetch({
                        limit: amount
                    });

                const deletableMessages =
                    fetched.filter(
                        msg =>
                            Date.now() -
                            msg.createdTimestamp <
                            1209600000
                    );

                await message.channel.bulkDelete(
                    deletableMessages,
                    true
                );

                return message.reply(
                    `🧹 Deleted ${deletableMessages.size} messages.`
                );

            } catch (err) {

                console.error(err);

            }

            return;
        }

    } catch (err) {

        console.error(err);

    }
});


// =========================
// LOGIN
// =========================
client.login(
    process.env.DISCORD_TOKEN
);
