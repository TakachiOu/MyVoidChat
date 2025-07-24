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
const activeRooms = new Map(); // <== متغير جديد ومهم لتتبع الغرف النشطة

// --- Main Connection Handler ---
io.on('connection', (socket) => {
    console.log(`[+] User Connected: ${socket.id}`);

    // --- Find Partner Logic (ROBUST VERSION) ---
    socket.on('findPartner', (tags) => {
        const searchTags = tags.length > 0 ? tags : ['#random'];
        let partnerFound = false;

        for (const tag of searchTags) {
            if (waitingUsers.has(tag) && waitingUsers.get(tag).length > 0) {
                // ابحث عن أول شريك صالح في قائمة الانتظار
                for (let i = 0; i < waitingUsers.get(tag).length; i++) {
                    const partnerSocketId = waitingUsers.get(tag)[i];

                    // الشرط الأهم: تأكد أن الشريك ليس هو أنت، وأنه لا يزال متصلاً بالخادم
                    if (partnerSocketId !== socket.id && io.sockets.sockets.has(partnerSocketId)) {
                        waitingUsers.get(tag).splice(i, 1); // احذف الشريك الذي تم إيجاده من قائمة الانتظار
                        const partnerSocket = io.sockets.sockets.get(partnerSocketId);

                        partnerFound = true;
                        const room = `room-${socket.id}-${partnerSocket.id}`;
                        
                        partnerSocket.join(room);
                        socket.join(room);

                        // سجل أن هذين المستخدمين الآن في غرفة محادثة نشطة
                        activeRooms.set(socket.id, room);
                        activeRooms.set(partnerSocket.id, room);

                        io.to(room).emit('matchFound', { room: room });
                        break; 
                    }
                }
            }
            if (partnerFound) break; 
        }

        if (!partnerFound) {
            for (const tag of searchTags) {
                if (!waitingUsers.has(tag)) { waitingUsers.set(tag, []); }
                // أضف المستخدم إلى قائمة الانتظار فقط إذا لم يكن موجوداً فيها بالفعل
                if (!waitingUsers.get(tag).includes(socket.id)) {
                    waitingUsers.get(tag).push(socket.id);
                }
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
        // احذف المستخدم وشريكه من الغرف النشطة
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

    // --- Disconnect Logic (ROBUST VERSION) ---
    socket.on('disconnect', () => {
        console.log(`[-] User Disconnected: ${socket.id}`);

        // إذا كان المستخدم في غرفة محادثة، أبلغ الشريك الآخر
        const room = activeRooms.get(socket.id);
        if (room) {
            socket.to(room).emit('partnerLeft');
            const partnerId = Array.from(activeRooms.keys()).find(id => activeRooms.get(id) === room && id !== socket.id);
            if (partnerId) activeRooms.delete(partnerId);
        }
        activeRooms.delete(socket.id);

        // احذفه من أي قائمة انتظار قد يكون فيها
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