const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);

// 1. تعريف الـ io (كان مفقوداً وتمت إضافته لتجنب الخطأ)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ==========================================
// 2. إعداد قاعدة البيانات (MongoDB Cloud)
// ==========================================
const dbURI = "mongodb+srv://takachi_admin:Abde%40bvb123@myvoidchatbd.kz1sfwq.mongodb.net/voidchat?retryWrites=true&w=majority&appName=MyVoidChatBD";

mongoose.connect(dbURI)
  .then(() => console.log("[Connected] MongoDB Cloud is ready! ✅"))
  .catch(err => console.error("[Error] Could not connect to MongoDB:", err));

// تعريف شكل الرسالة (Schema)
const messageSchema = new mongoose.Schema({
    room: String,
    senderId: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
// ==========================================

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

    // --- Find Partner Logic ---
    socket.on('findPartner', (tags) => {
        const searchTags = tags.length > 0 ? tags : ['#random'];
        let partnerFound = false;

        for (const tag of searchTags) {
            if (waitingUsers.has(tag) && waitingUsers.get(tag).length > 0) {
                for (let i = 0; i < waitingUsers.get(tag).length; i++) {
                    const partnerSocketId = waitingUsers.get(tag)[i];

                    if (partnerSocketId !== socket.id && io.sockets.sockets.has(partnerSocketId)) {
                        waitingUsers.get(tag).splice(i, 1); 
                        const partnerSocket = io.sockets.sockets.get(partnerSocketId);

                        partnerFound = true;
                        const room = `room-${socket.id}-${partnerSocket.id}`;
                        
                        partnerSocket.join(room);
                        socket.join(room);

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
                if (!waitingUsers.get(tag).includes(socket.id)) {
                    waitingUsers.get(tag).push(socket.id);
                }
            }
            socket.emit('waitingForPartner');
        }
    });

    // --- Chat Message Logic (مع حفظ الرسائل في القاعدة) ---
    socket.on('chatMessage', async (data) => {
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
        
        // إرسال الرسالة للشريك في نفس اللحظة
        socket.to(data.room).emit('chatMessage', data.message);

        // حفظ الرسالة في MongoDB بصمت
        try {
            const newMessage = new Message({
                room: data.room,
                senderId: socket.id,
                message: data.message
            });
            await newMessage.save();
            console.log(`[DB] Message saved in ${data.room}`);
        } catch (err) {
            console.error("[DB Error] Failed to save message:", err);
        }
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