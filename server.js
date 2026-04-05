// server.js - Final, Robust, and Secure Version

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

const messageLimiter = new Map();
const MESSAGE_RATE_LIMIT = 20;
const MESSAGE_RATE_PERIOD = 60 * 1000;

const messageHistory = new Map();
const waitingUsers = new Map();
const activeRooms = new Map();

// --- Main Connection Handler ---
io.on('connection', (socket) => {
    console.log(`[+] User Connected: ${socket.id}`);

    // --- Find Partner Logic (SMART FALLBACK MATCHING) ---
    socket.on('findPartner', (tags) => {
        // 1. تحويل كل التاغات لحروف صغيرة باش ما يفرقش بين DZ و dz
        const searchTags = tags.map(t => typeof t === 'string' ? t.toLowerCase() : t);
        let partnerSocketId = null;
        let matchedTag = null;

        // 2. المحاولة الأولى: البحث عن شخص يملك نفس الـ Tag
        for (const tag of searchTags) {
            if (waitingUsers.has(tag) && waitingUsers.get(tag).length > 0) {
                for (let i = 0; i < waitingUsers.get(tag).length; i++) {
                    const pId = waitingUsers.get(tag)[i];
                    if (pId !== socket.id && io.sockets.sockets.has(pId)) {
                        partnerSocketId = pId;
                        matchedTag = tag; // تم إيجاد تطابق
                        waitingUsers.get(tag).splice(i, 1);
                        break;
                    }
                }
            }
            if (partnerSocketId) break;
        }

        // 3. المحاولة الثانية: إذا لم نجد نفس الـ Tag، نبحث عن أي شخص في قائمة الانتظار العامة
        if (!partnerSocketId) {
            for (const [tag, users] of waitingUsers.entries()) {
                for (let i = 0; i < users.length; i++) {
                    const pId = users[i];
                    if (pId !== socket.id && io.sockets.sockets.has(pId)) {
                        partnerSocketId = pId;
                        matchedTag = null; // القيمة null تعني أنه لم يتم التطابق في الـ Tag
                        waitingUsers.get(tag).splice(i, 1);
                        break;
                    }
                }
                if (partnerSocketId) break;
            }
        }

        // 4. إذا وجدنا شريك (سواء بنفس الـ Tag أو عشوائي)
        if (partnerSocketId) {
            const partnerSocket = io.sockets.sockets.get(partnerSocketId);
            const room = `room-${socket.id}-${partnerSocket.id}`;
            
            partnerSocket.join(room);
            socket.join(room);

            activeRooms.set(socket.id, room);
            activeRooms.set(partnerSocket.id, room);

            // نبعث للطرفين بلي لقينا شريك ونخبروهم هل التطابق بالـ Tag ولا عشوائي
            io.to(socket.id).emit('matchFound', { room: room, matchedTag: matchedTag });
            io.to(partnerSocketId).emit('matchFound', { room: room, matchedTag: matchedTag });
        } else {
            // 5. إذا لم يكن هناك أي شخص في الموقع إطلاقاً، نضعه في قائمة الانتظار
            const waitTag = searchTags.length > 0 ? searchTags[0] : '#random';
            if (!waitingUsers.has(waitTag)) { waitingUsers.set(waitTag, []); }
            if (!waitingUsers.get(waitTag).includes(socket.id)) {
                waitingUsers.get(waitTag).push(socket.id);
            }
            socket.emit('waitingForPartner');
        }
    });

    // --- Chat Message Logic (with security) ---
    socket.on('chatMessage', (data) => {
        const history = messageHistory.get(socket.id) || [];
        if (data.message === history[0] && data.message === history[1]) return;

        const now = Date.now();
        const userTimestamps = messageLimiter.get(socket.id) || [];
        const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < MESSAGE_RATE_PERIOD);
        if (recentTimestamps.length >= MESSAGE_RATE_LIMIT) return;

        recentTimestamps.push(now);
        messageLimiter.set(socket.id, recentTimestamps);
        const newHistory = [data.message, ...history].slice(0, 2);
        messageHistory.set(socket.id, newHistory);
        socket.to(data.room).emit('chatMessage', data.message);
    });

    // --- "Is Typing" Logic ---
    socket.on('userTyping', (data) => socket.to(data.room).emit('partnerTyping'));
    socket.on('userStoppedTyping', (data) => socket.to(data.room).emit('partnerStoppedTyping'));

    // --- Leave/Cancel Logic ---
    socket.on('leaveRoom', (room) => {
        socket.leave(room);
        socket.to(room).emit('partnerLeft');
        const partnerId = Array.from(activeRooms.keys()).find(id => activeRooms.get(id) === room && id !== socket.id);
        activeRooms.delete(socket.id);
        if (partnerId) activeRooms.delete(partnerId);
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
        const room = activeRooms.get(socket.id);
        if (room) {
            socket.to(room).emit('partnerLeft');
            const partnerId = Array.from(activeRooms.keys()).find(id => activeRooms.get(id) === room && id !== socket.id);
            if (partnerId) activeRooms.delete(partnerId);
        }
        activeRooms.delete(socket.id);

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