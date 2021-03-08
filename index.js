const express = require("express");
const app = express();
const http = require("http").Server(app);
const supportsColor = require('supports-color');
const chalkAnimation = require('chalk-animation');

const sanitizeHtml = require("sanitize-html");

const io = require("socket.io")(http, {
    cors: {
        origin: "*",
    }
});

app.get("/", (x, res) => {
    return res.redirect(301, "https://chill.dogwiththebutteronhim.tk/")
})

const clients = [];

io.on("connection", socket => {
    clients.push(socket);

    socket.on("start", () => {
        socket.emit("nick", `guest${clients.length}`);
        clients[clients.indexOf(socket)].nick = `guest${clients.length}`;

        if (hasDuplicates(getUsers())) {
            clients[clients.indexOf(socket)].nick = `guest${clients.length+1}`;
            socket.emit("nick", `guest${clients.length+1}`);
        }

        io.emit("users list", getUsers());
    })

    socket.on("set rank", pass => {
        const tempUser = clients[clients.indexOf(socket)];
        if (pass === process.env.OWNER && tempUser.rank !== "owner") {
            socket.emit("info", {type: "good", message: "You've logged in!"})

            tempUser.rank = "owner"

            clients[clients.indexOf(socket)] = tempUser;

            io.emit("users list", getUsers());
        } else if (pass === process.env.MODERATOR && tempUser.rank !== "moderator") {
            socket.emit("info", {type: "good", message: "You've logged in!"})

            tempUser.rank = "moderator"

            clients[clients.indexOf(socket)] = tempUser;

            io.emit("users list", getUsers());
        }
    })

    socket.on("set nick", nick => {
        nick = cleanString(nick.trim());

        const amount = checkPermissions({
            getInfoFrom: clients[clients.indexOf(socket)].rank,
            default: 12,
            data: [
                ["owner", Number.MAX_SAFE_INTEGER],
                ["moderator", 40]
            ]
        });

        if (nick && nick.length <= amount) {
            clients[clients.indexOf(socket)].nick = nick;

            const users = getUsers();

            if (hasDuplicates(users)) {
                clients.splice(clients.indexOf(socket), 1);
                socket.emit("info", {type: "bad", message: "Your name is a duplicate."});
                socket.disconnect();
                return;
            }


            socket.emit("nick", nick)

            io.emit("info", {type: "good", message: `New user: ${nick}`})

            io.emit("users list", users);
        } else {
            socket.emit("info", {type: "bad", message: `Your name is too large. ${amount}/${nick.length}`})
        }
    });

    socket.on("send chat message", msg => {
        msg.message = cleanString(msg.message);

        msg.username = cleanString(msg.username);

        const amount = checkPermissions({
            getInfoFrom: clients[clients.indexOf(socket)].rank,
            default: 100,
            data: [
                ["owner", Number.MAX_SAFE_INTEGER],
                ["moderator", 300]
            ]
        });

        if (msg.username !== clients[clients.indexOf(socket)].nick) {
            socket.emit("info", {type: "neutral", message: "Found inconsitiency between chat message username and your actual username."});
            return;
        }

        if (msg.message && msg.message.length <= amount) {
            if (socket.lastMsg) {
                const timeoutMsg = checkPermissions({
                    getInfoFrom: clients[clients.indexOf(socket)].rank,
                    default: 500,
                    data: [
                        ["owner", 1],
                        ["moderator", 300]
                    ]
                });

                if (Date.now() - socket.lastMsg > timeoutMsg) {
                    if(!clients[clients.indexOf(socket)].muted)
                        io.emit("chat message", msg);
                    else
                        socket.emit("info", {type: "bad", message: "You are muted."})
                } else {
                    socket.emit("info", {type: "neutral", message: "Slow down."})
                }
            } else {
                io.emit("chat message", msg);
            }

            socket.lastMsg = Date.now();
        } else if(msg.message.length) {
            socket.emit("info", {type: "bad", message: `Your message is too large. ${amount}/${msg.message.length}`})
        }
    });

    socket.on("typing", () => {
        io.emit("typing signal", setUserTyping(clients.indexOf(socket)));
    });

    socket.on("not typing", () => {
        io.emit("typing signal", getUsers());
    });

    socket.on("listen", radio => {
        const allRadio = ["Lofi 1", "Lofi 2", "2000s", "Hiphop & RNB", 
            "Country", "Dance", "POP", "Jazz", 
            "Oldies", "Club", "Folk", "Classic Rock", 
            "Metal", "Death Metal", "Classical", "Alternative", 
            "Dubstep", "Oldschool", ""];

        if (!allRadio.includes(radio)) return;

        clients[clients.indexOf(socket)].listen = radio;
        io.emit("users list", getUsers());
    })

    socket.on("logout", () => {
        if (!clients[clients.indexOf(socket)].rank) return;
        clients[clients.indexOf(socket)].rank = ""

        socket.emit("info", {type: "bad", message: "You have logged out!"})
    
        io.emit("users list", getUsers());
    })

    socket.on("disconnect", () => {
        if (!clients[clients.indexOf(socket)]) return;
        
        if (clients[clients.indexOf(socket)].nick)
            io.emit("info", {type: "neutral", message: `User ${clients[clients.indexOf(socket)].nick} disconnected.`})

        clients.splice(clients.indexOf(socket), 1);
        io.emit("users list", getUsers());
    });

    socket.on("kick", id => {
        if(clients[clients.indexOf(socket)].rank && !clients[id].rank) {

            clients[id].emit("info", {type: "bad", message: "You have been kicked."})
            
            socket.emit("info", {type: "good", message: `Kicked ${clients[id].nick}`})
            setTimeout(e=>clients[id].disconnect(), 100);
        }
    })

    socket.on("mute", id => {
        if(clients[clients.indexOf(socket)].rank && !clients[id].rank) {

            socket.emit("info", {type: "good", message: `You have muted ${clients[id].nick}.`})

            clients[id].muted = true;
            clients[id].emit("info", {type: "bad", message: "You have been muted."});
        }
    })

    socket.on("unmute", id => {
        if(clients[clients.indexOf(socket)].rank && !clients[id].rank) {
            socket.emit("info", {type: "bad", message: `You have unmuted ${clients[id].nick}.`})
            clients[id].muted = false;
            clients[id].emit("info", {type: "good", message: "You have been unmuted."})
        }
    })

    socket.on("clear chat", () => {
        if(!clients[clients.indexOf(socket)].rank) return;

        io.emit("clear chat");
    })
});

http.listen(process.env.PORT || 3000, () => {
    if(supportsColor.stdout){
        chalkAnimation.rainbow(`Connected to port ${process.env.PORT || 3000}!!`)
    } else {
        console.log(`Connected to port ${process.env.PORT || 3000}..`)
    }
});


function hasDuplicates(array) {
    return (new Set(array.map(e => e.nick))).size !== array.length;
}

function checkPermissions(info) {
    let found = false;

    info.data.forEach(dataItem => {
        if (dataItem[0] === info.getInfoFrom) {
            found = dataItem[1];
        }
    })

    if (found)
        return found;
    else
        return info.default;
}

function cleanString(str) {
    const clean = sanitizeHtml(str, {
        allowedTags: [],
        allowedAttributes: {}
    });

    return clean;
}

const getUsers = () => clients.map(e => {
    return {
        nick: e.nick,
        rank: e.rank,
        listening: e.listen,
        typing: e.typing
    }
});

const setUserTyping = n => {
    const tempUsers = getUsers();
    tempUsers[n].typing = true;
    return tempUsers;
}