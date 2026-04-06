// server.js - Chatchi Server: Secure, Fast, and Personalized
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const cors = require('cors');
const nodemailer = require('nodemailer'); // <-- مكتبة الإيميل زدناها هنا

const app = express();
app.use(cors());
// تأكد أن ملفات الـ Front-end (index.html, style.css, script.js) موجودة في مجلد اسمه public
app.use(express.static('public'));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// --- إعداد Nodemailer لإرسال الاقتراحات للإيميل ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // إيميلك (لازم تعمرو في إعدادات Render)
    pass: process.env.EMAIL_PASS  // كود التطبيق (App Password)
  }
});

// --- 1. إعدادات الفلترة والحماية ---
const forbiddenWords = [
    'زب', 'نيك', 'حتشون', 'قحب', 'نقش', 'ترمة', 'سوة','قحبة','بنوتي', 'موجب', 'سالب', 'كس', 
    'dick', 'fack', 'زك', 'ديوث','شرموطة',
    'عطاي', 'منيوك', 'شرموط', 'fuck' 
];

// دالة لتنظيف الرسائل من الكلمات البذيئة ومنع حقن الكود (HTML/Scripts)
function filterAndSanitize(text) {
    if (typeof text !== 'string') return '';
    
    // منع الـ HTML Injection (تحويل < و > إلى نصوص عادية)
    let sanitized = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // فلترة الكلمات الممنوعة
    forbiddenWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        sanitized = sanitized.replace(regex, '*'.repeat(word.length));
    });
    return sanitized;
}

const messageLimiter = new Map();
const MESSAGE_RATE_LIMIT = 20; // 20 رسالة كحد أقصى
const MESSAGE_RATE_PERIOD = 60 * 1000; // في الدقيقة الواحدة

const messageHistory = new Map(); // لمنع الـ Spam (إرسال نفس الرسالة)
const waitingUsers = new Map();  // المستخدمين في قائمة الانتظار (مقسمين حسب الـ Tags)
const activeRooms = new Map();   // تتبع الغرف النشطة لكل مستخدم

// --- Main Connection Handler ---
io.on('connection', (socket) => {
    console.log(`[+] User Connected: ${socket.id}`);

    // تحديث عدد المتصلين فور دخول مستخدم جديد
    io.emit('updateOnlineUsers', io.engine.clientsCount);

    // --- منطق البحث عن شريك (Matching System) ---
    socket.on('findPartner', (tags) => {
        // تنظيف الـ Tags
        const searchTags = Array.isArray(tags) 
            ? tags.map(t => typeof t === 'string' ? t.toLowerCase().trim() : t).filter(t => t !== "")
            : [];
            
        let partnerSocketId = null;
        let matchedTag = null;

        // 1. محاولة المطابقة عبر الـ Tags
        for (const tag of searchTags) {
            if (waitingUsers.has(tag) && waitingUsers.get(tag).length > 0) {
                const usersInTag = waitingUsers.get(tag);
                for (let i = 0; i < usersInTag.length; i++) {
                    const pId = usersInTag[i];
                    if (pId !== socket.id && io.sockets.sockets.has(pId)) {
                        partnerSocketId = pId;
                        matchedTag = tag;
                        usersInTag.splice(i, 1);
                        break;
                    }
                }
            }
            if (partnerSocketId) break;
        }

        // 2. مطابقة عشوائية (Fallback) إذا لم نجد شخصاً بنفس الاهتمام
        if (!partnerSocketId) {
            for (const [tag, users] of waitingUsers.entries()) {
                for (let i = 0; i < users.length; i++) {
                    const pId = users[i];
                    if (pId !== socket.id && io.sockets.sockets.has(pId)) {
                        partnerSocketId = pId;
                        matchedTag = null; // نعتبرها عشوائية
                        users.splice(i, 1);
                        break;
                    }
                }
                if (partnerSocketId) break;
            }
        }

        if (partnerSocketId) {
            const partnerSocket = io.sockets.sockets.get(partnerSocketId);
            const room = `room-${socket.id}-${partnerSocketId}`;
            
            partnerSocket.join(room);
            socket.join(room);

            activeRooms.set(socket.id, room);
            activeRooms.set(partnerSocketId, room);

            io.to(socket.id).emit('matchFound', { room: room, matchedTag: matchedTag });
            io.to(partnerSocketId).emit('matchFound', { room: room, matchedTag: matchedTag });
            console.log(`[!] Match Created: ${socket.id} <-> ${partnerSocketId}`);
        } else {
            // إضافة المستخدم لقائمة الانتظار
            const waitTag = searchTags.length > 0 ? searchTags[0] : '#random';
            if (!waitingUsers.has(waitTag)) waitingUsers.set(waitTag, []);
            if (!waitingUsers.get(waitTag).includes(socket.id)) {
                waitingUsers.get(waitTag).push(socket.id);
            }
            socket.emit('waitingForPartner');
        }
    });

    // --- منطق الرسائل (Chat Logic) ---
    socket.on('chatMessage', (data) => {
        if (!data.message || !data.room) return;
        if (activeRooms.get(socket.id) !== data.room) return; // حماية إضافية للغرف

        const cleanMessage = filterAndSanitize(data.message);
        if (!cleanMessage) return;

        // منع الـ Spam التكراري
        const history = messageHistory.get(socket.id) || [];
        if (cleanMessage === history[0] && cleanMessage === history[1]) return;

        // Rate Limiting (تحديد سرعة الإرسال)
        const now = Date.now();
        const userTimestamps = messageLimiter.get(socket.id) || [];
        const recentTimestamps = userTimestamps.filter(t => now - t < MESSAGE_RATE_PERIOD);
        
        if (recentTimestamps.length >= MESSAGE_RATE_LIMIT) {
            return; // تجاهل الرسالة إذا تجاوز الحد
        }

        recentTimestamps.push(now);
        messageLimiter.set(socket.id, recentTimestamps);

        // تحديث التاريخ
        messageHistory.set(socket.id, [cleanMessage, ...history].slice(0, 2));

        // إرسال الرسالة للطرف الآخر فقط
        socket.to(data.room).emit('chatMessage', cleanMessage);
    });

    // Typing Indicators
    socket.on('userTyping', (data) => socket.to(data.room).emit('partnerTyping'));
    socket.on('userStoppedTyping', (data) => socket.to(data.room).emit('partnerStoppedTyping'));

    // مغادرة الغرفة
    socket.on('leaveRoom', (room) => {
        socket.leave(room);
        socket.to(room).emit('partnerLeft');
        activeRooms.delete(socket.id);
        console.log(`[-] User ${socket.id} left room`);
    });

    // إلغاء البحث
    socket.on('cancelSearch', () => {
        for (const [tag, users] of waitingUsers.entries()) {
            const index = users.indexOf(socket.id);
            if (index > -1) users.splice(index, 1);
        }
    });

    // --- الاقتراحات (إرسال عبر الإيميل بدلاً من الملف النصي) ---
    socket.on('submitSuggestion', (suggestion) => {
        const sanitized = suggestion.replace(/\s+/g, ' ').trim();
        if (sanitized && sanitized.length < 500) {
            const mailOptions = {
                from: `"Chatchi Feedback" <${process.env.EMAIL_USER}>`,
                to: process.env.EMAIL_USER,
                subject: '🚀 اقتراح جديد من Chatchi',
                text: `يا تاكاشي، وصلك اقتراح جديد من السيت:\n\n"${sanitized}"\n\nالوقت: ${new Date().toLocaleString('ar-DZ')}`
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error('Email Error:', err);
                } else {
                    console.log('Suggestion Email Sent Successfully!');
                }
            });
        }
    });

    // عند انقطاع الاتصال
    socket.on('disconnect', () => {
        const room = activeRooms.get(socket.id);
        if (room) {
            socket.to(room).emit('partnerLeft');
        }
        activeRooms.delete(socket.id);

        // حذف المستخدم من كل قوائم الانتظار
        for (const users of waitingUsers.values()) {
            const index = users.indexOf(socket.id);
            if (index > -1) users.splice(index, 1);
        }
        
        messageLimiter.delete(socket.id);
        messageHistory.delete(socket.id);
        io.emit('updateOnlineUsers', io.engine.clientsCount);
        console.log(`[x] User Disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Chatchi Server is live on port ${PORT}`);
});