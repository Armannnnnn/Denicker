const args = process.argv.slice(2);
const botID = args[0];
const username = args[1];

const NodeCache = require("node-cache");
const nickCache = new NodeCache();
const mineflayer = require("mineflayer");
const WebSocket = require("ws");
const axios = require("axios");
const { EmbedBuilder, WebhookClient } = require('discord.js');
const webhookClient = new WebhookClient({ url: 'DISCORD WEBHOOK' });
let ws;
const key = "HYPIXEL API KEY";

console.log(username)
const props = {
    host: 'mc.hypixel.net',
    username: username,
    port: 25565,
    version: '1.8.9',
    auth: "microsoft"
}
const playerTimeout = 12;

const delay = (milliseconds) =>
    new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });

function heartbeat() {
    clearTimeout(this.pingTimeout);

    this.pingTimeout = setTimeout(() => {
        ws.terminate();
    }, 2000 + 1000);
}

async function isMVP(uuid) {
    let result = false;
    const apiLink = `https://api.hypixel.net/player?key=${key}&uuid=${uuid}`;
    await axios.get(apiLink, { timeout: 3000 }).then(resp => {
        if (resp.data?.player?.monthlyPackageRank === undefined || resp.data?.player?.monthlyPackageRank === "NONE" && (resp.data?.player?.rank !== "YOUTUBER" && resp.data?.player?.rank !== "GAME_MASTER" && resp.data?.player?.rank !== "ADMIN")) {
            result = false;
        }
        else {
            result = true;
        }
    }).catch(function (err) {
        console.error(err);
        result = false;
    });

    return result;
}



function initBot() {

    let victim = ""
    const bindSocket = () => {
        ws = new WebSocket("ws://localhost:5555");

        ws.once("open", async () => {
            heartbeat.bind(this);
            console.log("Ws connected", ws.readyState === WebSocket.OPEN);
        });

        ws.on("ping", heartbeat);

        ws.on("close", async (e) => {
            console.log("Connection Closed to Express");
            await delay(1000);
            console.log("Trying to reconnect");
            if (e.code === 1000 && e.reason === "error") bindSocket();

        });

        ws.on("error", (err) => {
            ws.close(1000, "error");
            console.log(err);
        });

        ws.on("message", async (message) => {
            const msgJSON = JSON.parse(message)
            console.log("Message recieved", msgJSON)
            const uuid = msgJSON.uuid;
            victim = uuid;
            findNick(uuid);
        });
    };

    bot = mineflayer.createBot(props);
    console.log("New bot instance created.");



    bot.once("spawn", async () => {
        await goToLobby();
        console.log(`started ${bot.username}`);
        await bot.waitForTicks(10);
        await bot.chat("/whereami");
        bindSocket();
    });

    bot._client.on("chat", async (packet) => {
        try {
            let extra = JSON.parse(packet.message).extra[0].text;
            let text = JSON.parse(packet.message)["text"];
            console.log(extra);
            console.log(text);
            if (text.includes("lobby!") || extra.includes("lobby!")) {
                console.log("Lobby detected, attempting to do /skyblock.");
                bot.chat("/skyblock");
            }
            if (text.includes("appear to have") || extra.includes("appear to have")) {
                ws.send(JSON.stringify({ success: false, code: 400, data: { uuid: victim, nick: "Not found" } }));
            }
            if (text.includes("currently disabled") || extra.includes("currently disabled")) {
                const visitEmbed = new EmbedBuilder()
                    .setTitle('Visiting Disabled')
                    .setColor(0xED4245).setTimestamp();
                webhookClient.send({ embeds: [visitEmbed] });
                ws.close();
                bot.removeAllListeners();
                bot.end();

            }
            if (extra.includes("You are currently connected to server") || extra.includes("Sending you to") || extra.includes("AFK.") || text.includes("AFK.")) {
                bot.chat("/skyblock")
                console.log(text);
            }
            if (text.includes(`{"server"`)) {
                console.log(text);
            }
            if (extra.includes("command")) {
                console.log(`Cooldown triggered waiting 3 seconds, and trying again`);
                await bot.waitForTicks(60);
                findNick(victim);
            } else if (text.includes("Kicked") || text.includes("AFK.") || text.includes("A kick occurred")) {
                await goToLobby();
            }
        } catch (error) { }
    });


    bot.on("error", (err) => {
        try {
            ws.close(1000);
        } catch (e) {
            console.error(e);
        }
        console.error(botID + " | Error: " + err);
    });

    bot.on("end", function (reason) {
        const kickEmbed = new EmbedBuilder()
            .setTitle('Kick on ' + bot.username)
            .setColor(0x992D22).setTimestamp();
        webhookClient.send({ embeds: [kickEmbed] });
        console.log("Kick on " + bot.username);
        setTimeout(() => {
            initBot();
            const relogEmbed = new EmbedBuilder()
                .setTitle('Relogged Successfully')
                .setColor(0x57F287).setTimestamp();
            webhookClient.send({ embeds: [relogEmbed] });
        }, (5 + botID) * 1000)
    });

    bot.on("windowOpen", (window) => {
        let nick = "";
        window.slots.forEach(async (e) => {
            if (e?.name == "skull") {
                console.log(e.nbt.value.display);
                if (e.displayName === "Skeleton Skull") {
                    await delay(1000);
                    findNick(victim);
                    return;
                }
                nick = (e.nbt.value.display.value.Lore.value.value[0].replaceAll(/\u00A7[0-9A-FK-OR]/gi, ""));
                console.log(nick)
                if (nick.includes("Player: ")) {
                    nick = nick.replace("Player: ", "");
                }
                if (nick.includes("[")) {
                    nick = "Not in use";
                }
                console.log("nick is", nick);

            }
        })
        if (nick === "Players:" || nick === "") {
            ws.send(JSON.stringify({ success: true, code: 200, data: { uuid: victim, nick: "Not in use" }, msTime: Date.now() }))
        }
        else {
            ws.send(JSON.stringify({ success: true, code: 200, data: { uuid: victim, nick: nick, cached: Date.now() }, msTime: Date.now() }))
            nickCache.set(victim, JSON.stringify({ success: true, code: 200, data: { uuid: victim, nick: nick, cached: Date.now() }, msTime: Date.now() }), 3600);
        }
        console.log({ nick: nick });
    });





    async function findNick(uuid) {
        if (await isMVP(uuid)) {
            if (!nickCache.has(uuid))
                bot.chat(`/visit ${uuid}`);
            else {
                let cachedResponse = JSON.parse(nickCache.get(uuid));
                cachedResponse.msTime = Date.now();
                ws.send(JSON.stringify(cachedResponse));
            }
        }
    }

    const goToLobby = async () => {
        await bot.waitForTicks(playerTimeout);
        await bot.chat("/skyblock");
        await bot.waitForTicks(playerTimeout);
    };


}

initBot();
