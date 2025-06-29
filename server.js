// server.js - Final Clean Version
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const waitingUsers = new Map();

io.on('connection', (socket) => {
    console.log(`[+] User Connected: ${socket.id}`);

    socket.on('findPartner', (tags) => {
        const searchTags = tags.length > 0 ? tags : ['#random'];
        let partnerFound = false;
        for (const tag of searchTags) {
            if (waitingUsers.has(tag) && waitingUsers.get(tag).length > 0) {
                const partnerSocketId = waitingUsers.get(tag).shift();
                const partnerSocket = io.sockets.sockets.get(partnerSocketId);
                if (partnerSocket) {
                    partnerFound = true;
                    const room = `room-${socket.id}-${partnerSocket.id}`;
                    partnerSocket.join(room);
                    socket.join(room);
                    console.log(`[!] MATCH FOUND! Room: ${room}.`);
                    io.to(room).emit('matchFound', { room: room });
                    break;
                }
            }
        }
        if (!partnerFound) {
            for (const tag of searchTags) {
                if (!waitingUsers.has(tag)) { waitingUsers.set(tag, []); }
                waitingUsers.get(tag).push(socket.id);
            }
            socket.emit('waitingForPartner');
            console.log(`[-] No partner for ${socket.id}. Added to queue.`);
        }
    });

    socket.on('chatMessage', (data) => {
        socket.to(data.room).emit('chatMessage', data.message);
    });

    socket.on('userTyping', (data) => {
        socket.to(data.room).emit('partnerTyping');
    });

    socket.on('userStoppedTyping', (data) => {
        socket.to(data.room).emit('partnerStoppedTyping');
    });

    socket.on('leaveRoom', (room) => {
        socket.leave(room);
        console.log(`[<] User ${socket.id} LEFT room: ${room}`);
        socket.to(room).emit('partnerLeft');
    });

    socket.on('cancelSearch', () => {
        console.log(`[<] User ${socket.id} CANCELED search.`);
        for (const users of waitingUsers.values()) {
            const index = users.indexOf(socket.id);
            if (index > -1) { users.splice(index, 1); }
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] User Disconnected: ${socket.id}`);
        for (const users of waitingUsers.values()) {
            const index = users.indexOf(socket.id);
            if (index > -1) { users.splice(index, 1); }
        }
    });
});

server.listen(PORT, () => {
    console.log(`VoidChat Server is running on http://localhost:${PORT}`);
});