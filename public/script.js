document.addEventListener('DOMContentLoaded', () => {

    // =================================
    // 1. التهيئة والمحددات
    // =================================
    const socket = io("https://chatchi.onrender.com");
    socket.on('updateOnlineUsers', (count) => {
        const counter = document.getElementById('onlineCount');
        if (counter) counter.textContent = count;
    });
    let currentRoom = '';
    let typingTimer;
    const typingTimeout = 1500;
    const tags = new Set();

    // --- قائمة الكلمات الممنوعة ---
    const forbiddenWords = [
        'زب', 'نيك', 'حتشون', 'قحب', 'نقش', 'ترمة', 'سوة','قحبة','بنوتي', 'موجب', 'سالب', 'كس', 
        'dick', 'fack', 'زك', 'ديوث','شرموطة', 'عطاي', 'منيوك', 'شرموط', 'fuck' 
    ];

    // محددات العناصر
    const mainView = document.getElementById('main-view');
    const chatView = document.getElementById('chat-view');
    const tagsInput = document.getElementById('tags-input');
    const tagsArea = document.getElementById('tags-area');
    const ctaButton = document.querySelector('.cta-button');
    const chatStatus = document.querySelector('.chat-status');
    const messagesArea = document.querySelector('.messages-area');
    const inputField = document.getElementById('chat-input-field');
    const sendButton = document.getElementById('send-button');
    const leaveButton = document.getElementById('leave-button');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmYesBtn = document.getElementById('confirm-yes-btn');
    const confirmNoBtn = document.getElementById('confirm-no-btn');
    const langToggleButton = document.getElementById('lang-toggle');

    // =================================
    // 2. قاموس الترجمة (تمت إضافة مفاتيح جديدة)
    // =================================
    const translations = {
        ar: {
            langToggle: 'English',
            siteTitle: 'Chatchi - تحدث مع المجهول',
            mainTitle: 'ادخل الفراغ و تحدث مع المجهول',
            subtitle: 'مرحباً بك في Chatchi.. مساحة للبوح وتبادل الأسرار بقلبٍ مطمئن.',
            tagsPlaceholder: 'اكتب tag للدخول إلى دردشة مع من كتب نفس الـtag',
            ctaButton: 'ابحث عن شخص',
            searchingButton: 'جارٍ البحث...',
            aboutTitle: 'ما هو Chatchi؟',
            aboutText: 'هي منصة بسيطة ومساحة آمنة تتيح لك فرصة الدخول في محادثات نصية، عشوائية، ومجهولة الهوية تماماً .',
            featuresTitle: 'أبرز مميزاتنا',
            feature1: '<strong>هوية مجهولة بالكامل:</strong> لا نطلب أي معلومات شخصية.',
            feature2: '<strong>محادثات سرية:</strong> كل الرسائل تُحذف للأبد بمجرد إنهاء المحادثة.',
            feature3: '<strong>مطابقة ذكية:</strong> استعمل tag إن أحببت.',
            rulesTitle: 'قواعد المنصة',
            rule1: 'لضمان تواصلٍ ممتع ومستمر، يُرجى البقاء في غرفة الدردشة وعدم مغادرتها حتى لا تنقطع المحادثة بين الطرفين.',
            rule2: 'اتقِ الله في قولك، فما تكتبه مسجلٌ في صحيفتك',
            rule3: 'استمتع بتجربتك وكن سبباً في جعل تجربة الآخرين ممتعة.',
            copyright: '© 2026 Chatchi. جميع الحقوق محفوظة.',
            credit: 'صُنع بكل ❤️ بواسطة <a href="" target="_blank" class="credit-link">TaKaChi</a>',
            chatPlaceholder: 'اكتب رسالتك...',
            chatSendBtn: 'إرسال',
            statusSearching: 'جارٍ البحث عن غريب',
            statusMatchFoundTag: 'تم الاتصال بشريك يشاركك الـ Tag: ',
            statusMatchFoundRandom: 'تم الاتصال بغريب (لم نجد نفس الـ Tag)',
            partnerTyping: 'شريكك يكتب الآن...',
            partnerLeft: 'لقد غادر الغريب المحادثة.',
            partnerSuddenLeft: 'انقطع الاتصال مع الغريب فجأة.',
            partnerAway: 'الشريك في الخلفية (Away)',
            confirmLeaveTitle: 'هل أنت متأكد؟',
            confirmLeaveText: 'هل تريد حقاً مغادرة المحادثة؟',
            confirmYes: 'نعم، غادر',
            confirmNo: 'لا، ابقَ'
        },
        en: {
            langToggle: 'العربية',
            siteTitle: 'Chatchi - Talk with a Stranger',
            mainTitle: 'Enter the Void & Talk with the Unknown',
            subtitle: 'Welcome to Chatchi.. A sanctuary for opening up and sharing secrets.',
            tagsPlaceholder: 'Enter a tag to chat with someone with the same tag',
            ctaButton: 'Find a Stranger',
            searchingButton: 'Searching...',
            aboutTitle: 'What is Chatchi?',
            aboutText: 'It is a simple platform and a safe space for anonymous conversations.',
            featuresTitle: 'Our Top Features',
            feature1: '<strong>Completely Anonymous:</strong> No personal info required.',
            feature2: '<strong>Ephemeral Chats:</strong> Messages are deleted forever.',
            feature3: '<strong>Smart Matching:</strong> Use tags or go random.',
            rulesTitle: 'Platform Rules',
            rule1: 'To ensure an enjoyable and continuous conversation, please remain in the chat room and do not leave, so the conversation does not get interrupted between both parties.',
            rule2: 'No profanity allowed. Every word is recorded in your deeds.',
            rule3: 'Enjoy and be kind.',
            copyright: '© 2026 Chatchi. All rights reserved.',
            credit: 'Made with ❤️ by <a href="" target="_blank" class="credit-link">TaKaChi</a>',
            chatPlaceholder: 'Type your message...',
            chatSendBtn: 'Send',
            statusSearching: 'Searching for a stranger',
            statusMatchFoundTag: 'Connected with a partner sharing Tag: ',
            statusMatchFoundRandom: 'Connected with a stranger',
            partnerTyping: 'Partner is typing...',
            partnerLeft: 'The stranger has left the conversation.',
            partnerSuddenLeft: 'Stranger lost connection suddenly.',
            partnerAway: 'Partner is away (Background)',
            confirmLeaveTitle: 'Are you sure?',
            confirmLeaveText: 'Do you really want to leave the conversation?',
            confirmYes: 'Yes, Leave',
            confirmNo: 'No, Stay'
        }
    };
    let currentLang = 'ar';

    // =================================
    // 3. الوظائف المساعدة
    // =================================

    function applyTranslations() {
        document.documentElement.lang = currentLang;
        document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

        const elementsToTranslate = document.querySelectorAll('[data-key]');
        elementsToTranslate.forEach(element => {
            const key = element.getAttribute('data-key');
            if (translations[currentLang][key]) {
                if (element.hasAttribute('placeholder')) {
                    element.placeholder = translations[currentLang][key];
                } else {
                    element.innerHTML = translations[currentLang][key];
                }
            }
        });

        // تحديث حالة الشات بناءً على اللغة
        updateChatStatusUI();
    }

    function updateChatStatusUI() {
        const matchType = chatStatus.dataset.matchType;
        if (matchType === 'tag') {
            chatStatus.textContent = translations[currentLang].statusMatchFoundTag + chatStatus.dataset.matchedTag;
        } else if (matchType === 'random') {
            chatStatus.textContent = translations[currentLang].statusMatchFoundRandom;
        } else {
            const currentStatusKey = chatStatus.dataset.keyStatus;
            if (currentStatusKey && translations[currentLang][currentStatusKey]) {
                chatStatus.textContent = translations[currentLang][currentStatusKey];
            }
        }
    }

    function filterLocalMessage(text) {
        let filteredText = text;
        forbiddenWords.forEach(word => {
            const regex = new RegExp(word, 'gi');
            filteredText = filteredText.replace(regex, '*'.repeat(word.length));
        });
        return filteredText;
    }

    function renderTags() {
        tagsArea.innerHTML = '';
        tags.forEach(tag => {
            const tagElement = document.createElement('div');
            tagElement.classList.add('tag-item');
            tagElement.innerHTML = `${tag}<span class="close-btn" data-tag-value="${tag}">&times;</span>`;
            tagsArea.appendChild(tagElement);
        });
    }

    function displayMessage(message, type) {
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble', type);
        bubble.textContent = message;
        messagesArea.appendChild(bubble);
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    function sendMessage() {
        const rawMessage = inputField.value.trim();
        if (rawMessage && currentRoom) {
            socket.emit('chatMessage', { room: currentRoom, message: rawMessage });
            const cleanMessage = filterLocalMessage(rawMessage);
            displayMessage(cleanMessage, 'my-message');
            inputField.value = '';
            inputField.focus();
        }
    }

    function resetChatState() {
        chatView.classList.add('hidden');
        mainView.classList.remove('hidden');
        ctaButton.querySelector('span').textContent = translations[currentLang].ctaButton;
        ctaButton.disabled = false;
        messagesArea.innerHTML = '';
        inputField.disabled = true;
        sendButton.disabled = true;
        leaveButton.disabled = true;
        currentRoom = '';
        chatStatus.textContent = '';
        chatStatus.dataset.keyStatus = '';
        chatStatus.dataset.matchType = '';
        chatStatus.dataset.matchedTag = '';
    }

    let dotAnimationInterval;

    function startDotAnimation() {
        let dotCount = 0;
        stopDotAnimation();
        dotAnimationInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4;
            const dots = '.'.repeat(dotCount);
            chatStatus.textContent = translations[currentLang].statusSearching + dots;
        }, 500);
    }

    function stopDotAnimation() {
        if (dotAnimationInterval) {
            clearInterval(dotAnimationInterval);
            dotAnimationInterval = null;
        }
    }

    // =================================
    // 4. مستمعو الأحداث (User Actions)
    // =================================

    langToggleButton.addEventListener('click', () => {
        currentLang = currentLang === 'ar' ? 'en' : 'ar';
        applyTranslations();
    });

    tagsInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            const newTag = tagsInput.value.trim().toLowerCase();
            if (newTag && !tags.has(newTag)) {
                tags.add(newTag);
                renderTags();
            }
            tagsInput.value = '';
        }
    });

    tagsArea.addEventListener('click', (event) => {
        if (event.target.classList.contains('close-btn')) {
            const tagToDelete = event.target.getAttribute('data-tag-value');
            tags.delete(tagToDelete);
            renderTags();
        }
    });

    ctaButton.addEventListener('click', () => {
        ctaButton.querySelector('span').textContent = translations[currentLang].searchingButton;
        ctaButton.disabled = true;
        socket.emit('findPartner', Array.from(tags));
    });

    sendButton.addEventListener('click', sendMessage);
    inputField.addEventListener('keyup', (event) => { if (event.key === 'Enter') sendMessage(); });

    inputField.addEventListener('input', () => {
        clearTimeout(typingTimer);
        if (inputField.value.trim() !== '') {
            socket.emit('userTyping', { room: currentRoom });
            typingTimer = setTimeout(() => {
                socket.emit('userStoppedTyping', { room: currentRoom });
            }, typingTimeout);
        } else {
            socket.emit('userStoppedTyping', { room: currentRoom });
        }
    });

    leaveButton.addEventListener('click', () => {
        confirmModal.classList.remove('hidden');
    });

    confirmNoBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    confirmYesBtn.addEventListener('click', () => {
        stopDotAnimation();
        if (currentRoom) {
            socket.emit('leaveRoom', currentRoom);
        } else {
            socket.emit('cancelSearch');
        }
        resetChatState();
        confirmModal.classList.add('hidden');
    });

    // =================================
    // 5. مستمعو أحداث الخادم (Socket Events)
    // =================================

    socket.on('waitingForPartner', () => {
        mainView.classList.add('hidden');
        chatView.classList.remove('hidden');
        chatStatus.textContent = translations[currentLang].statusSearching;
        chatStatus.dataset.keyStatus = 'statusSearching';
        chatStatus.dataset.matchType = '';
        leaveButton.disabled = false;
        startDotAnimation();
    });

    socket.on('matchFound', (data) => {
        stopDotAnimation();
        currentRoom = data.room;
        mainView.classList.add('hidden');
        chatView.classList.remove('hidden');
        
        if (data.matchedTag) {
            chatStatus.textContent = translations[currentLang].statusMatchFoundTag + data.matchedTag;
            chatStatus.dataset.matchType = 'tag';
            chatStatus.dataset.matchedTag = data.matchedTag;
        } else {
            chatStatus.textContent = translations[currentLang].statusMatchFoundRandom;
            chatStatus.dataset.matchType = 'random';
            chatStatus.dataset.matchedTag = '';
        }

        inputField.disabled = false;
        sendButton.disabled = false;
        leaveButton.disabled = false;
        inputField.focus();
    });

    // معالجة مغادرة الطرف الآخر (عادية أو مفاجئة)
    socket.on('partnerLeft', (data) => {
        stopDotAnimation();
        const reasonKey = (data && data.reason === 'sudden_disconnect') ? 'partnerSuddenLeft' : 'partnerLeft';
        displayMessage(translations[currentLang][reasonKey], 'system-message');
        
        inputField.disabled = true;
        sendButton.disabled = true;
        chatStatus.textContent = translations[currentLang][reasonKey];
        chatStatus.dataset.keyStatus = reasonKey;
        chatStatus.dataset.matchType = '';
    });

    // معالجة دخول الشريك للخلفية
    socket.on('partnerAppStateChanged', (state) => {
        if (state === 'inactive') {
            chatStatus.textContent = translations[currentLang].partnerAway;
        } else {
            updateChatStatusUI(); // العودة للحالة الأصلية (التاغ أو عشوائي)
        }
    });

    socket.on('partnerTyping', () => {
        chatStatus.textContent = translations[currentLang].partnerTyping;
    });

    socket.on('partnerStoppedTyping', () => {
        updateChatStatusUI();
    });

    socket.on('chatMessage', (message) => {
        const cleanMessage = filterLocalMessage(message);
        displayMessage(cleanMessage, 'stranger-message');
    });

    socket.on('syncMessages', (messages) => {
        messages.forEach(msg => {
            // نفلترو الرسالة ونعرضوها كأنها رسالة غريب
            const cleanMessage = filterLocalMessage(msg.message);
            displayMessage(cleanMessage, 'stranger-message');
        });
    });

    // =================================
    // 6. تكامل Capacitor (أهم جزء)
    // =================================
    if (window.Capacitor) {
        const { App } = Capacitor.Plugins;

        // مستمع لزر الرجوع
        App.addListener('backButton', () => {
            const isModalVisible = !confirmModal.classList.contains('hidden');
            const isChatViewVisible = !chatView.classList.contains('hidden');
            if (isModalVisible) {
                confirmModal.classList.add('hidden');
            } else if (isChatViewVisible) {
                confirmModal.classList.remove('hidden');
            } else {
                App.exitApp();
            }
        });

        // مستمع لحالة التطبيق (Background/Foreground) - الحل رقم 2
App.addListener('appStateChange', ({ isActive }) => {
            if (currentRoom) {
                socket.emit('updateAppState', { state: isActive ? 'active' : 'inactive' });
                if (isActive) {
                    socket.emit('requestSync');
                } 
            } 
        }); 
    } 
});