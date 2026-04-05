// server.js - Final, Robust, and Secure Version with Content Filtering

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

// --- 1. إعدادات الفلترة والحماية ---
const forbiddenWords = ['زب', 'نيك', 'موك', 'قحب', 'فرخ', 'طحان', 'خرا'];

function filterMessage(text) {
    if (typeof text !== 'string') return text;
    let filteredText = text;
    forbiddenWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredText = filteredText.replace(regex, '*'.repeat(word.length));
    });
    return filteredText;
}

const messageLimiter = new Map();
const MESSAGE_RATE_LIMIT = 20;
const MESSAGE_RATE_PERIOD = 60 * 1000;

const messageHistory = new Map();
const waitingUsers = new Map();
const activeRooms = new Map();

// --- Main Connection Handler ---
io.on('connection', (socket) => {
    console.log(`[+] User Connected: ${socket.id}`);

    // تحديث عدد المتصلين (اختياري إذا كنت تستعمله)
    io.emit('updateOnlineUsers', io.engine.clientsCount);

    // --- Find Partner Logic (SMART FALLBACK MATCHING) ---
    socket.on('findPartner', (tags) => {
        const searchTags = tags.map(t => typeof t === 'string' ? t.toLowerCase() : t);
        let partnerSocketId = null;
        let matchedTag = null;

        // البحث عن شخص يملك نفس الـ Tag
        for (const tag of searchTags) {
            if (waitingUsers.has(tag) && waitingUsers.get(tag).length > 0) {
                for (let i = 0; i < waitingUsers.get(tag).length; i++) {
                    const pId = waitingUsers.get(tag)[i];
                    if (pId !== socket.id && io.sockets.sockets.has(pId)) {
                        partnerSocketId = pId;
                        matchedTag = tag;
                        waitingUsers.get(tag).splice(i, 1);
                        break;
                    }
                }
            }
            if (partnerSocketId) break;
        }

        // البحث العشوائي إذا لم نجد التاغ
        if (!partnerSocketId) {
            for (const [tag, users] of waitingUsers.entries()) {
                for (let i = 0; i < users.length; i++) {
                    const pId = users[i];
                    if (pId !== socket.id && io.sockets.sockets.has(pId)) {
                        partnerSocketId = pId;
                        matchedTag = null;
                        waitingUsers.get(tag).splice(i, 1);
                        break;
                    }
                }
                if (partnerSocketId) break;
            }
        }

        if (partnerSocketId) {
            const partnerSocket = io.sockets.sockets.get(partnerSocketId);
            const room = `room-${socket.id}-${partnerSocket.id}`;
            
            partnerSocket.join(room);
            socket.join(room);

            activeRooms.set(socket.id, room);
            activeRooms.set(partnerSocket.id, room);

            io.to(socket.id).emit('matchFound', { room: room, matchedTag: matchedTag });
            io.to(partnerSocketId).emit('matchFound', { room: room, matchedTag: matchedTag });
        } else {
            const waitTag = searchTags.length > 0 ? searchTags[0] : '#random';
            if (!waitingUsers.has(waitTag)) { waitingUsers.set(waitTag, []); }
            if (!waitingUsers.get(waitTag).includes(socket.id)) {
                waitingUsers.get(waitTag).push(socket.id);
            }
            socket.emit('waitingForPartner');
        }
    });

    // --- Chat Message Logic (WITH FILTERING & SECURITY) ---
    socket.on('chatMessage', (data) => {
        if (!data.message || !data.room) return;

        // 1. فلترة الرسالة فوراً
        const cleanMessage = filterMessage(data.message);

        // 2. منع التكرار المزعج (Spam Prevention)
        const history = messageHistory.get(socket.id) || [];
        if (cleanMessage === history[0] && cleanMessage === history[1]) return;

        // 3. تحديد سرعة الإرسال (Rate Limiting)
        const now = Date.now();
        const userTimestamps = messageLimiter.get(socket.id) || [];
        const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < MESSAGE_RATE_PERIOD);
        if (recentTimestamps.length >= MESSAGE_RATE_LIMIT) return;

        recentTimestamps.push(now);
        messageLimiter.set(socket.id, recentTimestamps);

        // 4. تحديث سجل الرسائل
        const newHistory = [cleanMessage, ...history].slice(0, 2);
        messageHistory.set(socket.id, newHistory);

        // 5. إرسال الرسالة "المفلترة" للطرف الآخر في الغرفة
        socket.to(data.room).emit('chatMessage', cleanMessage);
    });

    // --- "Is Typing" Logic ---
    socket.on('userTyping', (data) => socket.to(data.room).emit('partnerTyping'));
    socket.on('userStoppedTyping', (data) => socket.to(data.room).emit('partnerStoppedTyping'));

    // --- Leave/Cancel Logic ---
    socket.on('leaveRoom', (room) => {
        socket.leave(room);
        socket.to(room).emit('partnerLeft');
        activeRooms.delete(socket.id);
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
            });
        }
    });

    // --- Disconnect Logic ---
    socket.on('disconnect', () => {
        const room = activeRooms.get(socket.id);
        if (room) {
            socket.to(room).emit('partnerLeft');
        }
        activeRooms.delete(socket.id);

        for (const users of waitingUsers.values()) {
            const index = users.indexOf(socket.id);
            if (index > -1) { users.splice(index, 1); }
        }
        
        messageLimiter.delete(socket.id);
        messageHistory.delete(socket.id);
        io.emit('updateOnlineUsers', io.engine.clientsCount);
    });
});

server.listen(PORT, () => {
    console.log(`VoidChat Server is running on port ${PORT}`);
});