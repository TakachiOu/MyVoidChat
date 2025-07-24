// server.js - Final, Clean, and Complete Version

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// --- Configuration for Features ---
const messageLimiter = new Map();
const MESSAGE_RATE_LIMIT = 20; // 20 messages
const MESSAGE_RATE_PERIOD = 60 * 1000; // per 1 minute

const messageHistory = new Map(); // For anti-repetition
const waitingUsers = new Map();

// --- Main Connection Handler ---
io.on('connection', (socket) => {
    console.log(`[+] User Connected: ${socket.id}`);

    // --- Find Partner Logic ---
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
        }
    });

    // --- Chat Message Logic (with security) ---
    socket.on('chatMessage', (data) => {
        // 1. Anti-Repetition Check
        const history = messageHistory.get(socket.id) || [];
        if (data.message === history[0] && data.message === history[1]) {
            console.log(`[!] User ${socket.id} blocked for message repetition.`);
            return;
        }

        // 2. Rate Limiting Check
        const now = Date.now();
        const userTimestamps = messageLimiter.get(socket.id) || [];
        const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < MESSAGE_RATE_PERIOD);
        if (recentTimestamps.length >= MESSAGE_RATE_LIMIT) {
            console.log(`[!] User ${socket.id} has been rate-limited.`);
            return;
        }

        // 3. If all checks pass, update history and send message
        recentTimestamps.push(now);
        messageLimiter.set(socket.id, recentTimestamps);

        const newHistory = [data.message, ...history].slice(0, 2);
        messageHistory.set(socket.id, newHistory);

        socket.to(data.room).emit('chatMessage', data.message);
    });

    // --- "Is Typing" Logic ---
    socket.on('userTyping', (data) => {
        socket.to(data.room).emit('partnerTyping');
    });
    socket.on('userStoppedTyping', (data) => {
        socket.to(data.room).emit('partnerStoppedTyping');
    });

    // --- Leave/Cancel Logic ---
    socket.on('leaveRoom', (room) => {
        socket.leave(room);
        socket.to(room).emit('partnerLeft');
    });
    socket.on('cancelSearch', () => {
        for (const users of waitingUsers.values()) {
            const index = users.indexOf(socket.id);
            if (index > -1) { users.splice(index, 1); }
        }
    });

    // --- Suggestion Box Logic ---
    socket.on('submitSuggestion', (suggestion) => {
        const sanitizedSuggestion = suggestion.replace(/\s+/g, ' ').trim();
        if (sanitizedSuggestion) {
            const timestamp = new Date().toISOString();
            const formattedSuggestion = `[${timestamp}] - ${sanitizedSuggestion}\n-----------------\n`;
            fs.appendFile('suggestions.txt', formattedSuggestion, (err) => {
                if (err) { console.error('Failed to save suggestion:', err); }
                else { console.log(`[+] New suggestion received: "${sanitizedSuggestion}"`); }
            });
        }
    });

    // --- Disconnect Logic ---
    socket.on('disconnect', () => {
        console.log(`[-] User Disconnected: ${socket.id}`); 

        // Cleanup from all systems
        for (const users of waitingUsers.values()) {
            const index = users.indexOf(socket.id);
            if (index > -1) { users.splice(index, 1); }
        }
        messageLimiter.delete(socket.id);
        messageHistory.delete(socket.id);
    });
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`VoidChat Server is running on http://localhost:${PORT}`);
});