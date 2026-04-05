document.addEventListener('DOMContentLoaded', () => {

    // =================================
    // 1. التهيئة والمحددات
    // =================================
    const socket = io("https://myvoidchat.onrender.com");
    socket.on('updateOnlineUsers', (count) => {
        const counter = document.getElementById('onlineCount');
        if (counter) counter.textContent = count;
    });
    let currentRoom = '';
    let typingTimer;
    const typingTimeout = 1500;
    const tags = new Set();

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
    const suggestionTextarea = document.getElementById('suggestion-textarea');
    const submitSuggestionBtn = document.getElementById('submit-suggestion-btn');
    const suggestionThanksMsg = document.getElementById('suggestion-thanks');
    const langToggleButton = document.getElementById('lang-toggle');

    // =================================
    // 2. قاموس الترجمة
    // =================================
    const translations = {
        ar: {
            langToggle: 'English',
            siteTitle: 'VoidChat - تحدث مع المجهول',
            mainTitle: 'ادخل الفراغ و تحدث مع المجهول',
            subtitle: 'مرحباً بك في VoidChat.. مساحة للبوح وتبادل الأسرار بقلبٍ مطمئن. صُمم هذا الموقع ليكون متنفساً لكل من أثقلته الهموم، لكي يحكي مشاكله لمن لا يعرفه فيرتاح قلبه',
            tagsPlaceholder: 'اكتب tag للدخول إلى دردشة مع من كتب نفس الـtag',
            ctaButton: 'ابحث عن شخص',
            searchingButton: 'جارٍ البحث...',
            aboutTitle: 'ما هو VoidChat؟',
            aboutText: 'هي منصة بسيطة ومساحة آمنة تتيح لك فرصة الدخول في محادثات نصية، عشوائية، ومجهولة الهوية تماماً .',
            featuresTitle: 'أبرز مميزاتنا',
            feature1: '<strong>هوية مجهولة بالكامل:</strong> لا نطلب أي معلومات شخصية.',
            feature2: '<strong>محادثات سرية:</strong> كل الرسائل تُحذف للأبد بمجرد إنهاء المحادثة.',
            feature3: '<strong>مطابقة ذكية:</strong> استعمل tag إن أحببت، وإن لم تجد أحدًا، غيّره أو ادخل بدون tag.',
            rulesTitle: 'قواعد المنصة',
            rule1: 'التحلي بالاحترام المتبادل وتجنب أي لغة مسيئة.',
            rule2: 'لتبقى هذه المساحة نقية، يُمنع منعاً باتاً السب، الشتم، أو استغلال المنصة فيما حرمه الله . اتقِ الله في قولك، فما تكتبه مسجلٌ في صحيفتك',
            rule3: 'استمتع بتجربتك وكن سبباً في جعل تجربة الآخرين ممتعة.',
            suggestionTitle: 'لديك اقتراح لتحسين الموقع؟',
            suggestionText: 'نحن نستمع لآرائكم. شاركنا أفكارك لمساعدتنا على التطور.',
            suggestionPlaceholder: 'اكتب اقتراحك هنا...',
            suggestionBtn: 'إرسال الاقتراح',
            suggestionThanks: 'شكراً لك! تم إرسال اقتراحك بنجاح.',
            copyright: '© 2025 VoidChat. جميع الحقوق محفوظة.',
            credit: 'صُنع بكل ❤️ بواسطة <a href="" target="_blank" class="credit-link">Developer</a>',
            chatPlaceholder: 'اكتب رسالتك...',
            chatSendBtn: 'إرسال',
            statusSearching: 'جارٍ البحث عن غريب',
            // الجمل الجديدة للتطابق
            statusMatchFoundTag: 'تم الاتصال بشريك يشاركك الـ Tag: ',
            statusMatchFoundRandom: 'تم الاتصال بغريب (لم نجد نفس الـ Tag)',
            partnerTyping: 'شريكك يكتب الآن...',
            partnerLeft: 'لقد غادر الغريب المحادثة.',
            confirmLeaveTitle: 'هل أنت متأكد؟',
            confirmLeaveText: 'هل تريد حقاً مغادرة المحادثة؟',
            confirmYes: 'نعم، غادر',
            confirmNo: 'لا، ابقَ'
        },
        en: {
            langToggle: 'العربية',
            siteTitle: 'VoidChat - Talk with a Stranger',
            mainTitle: 'Enter the Void & Talk with the Unknown',
            subtitle: 'Welcome to VoidChat.. A sanctuary for opening up and sharing secrets with peace of mind. This platform was designed to be a vent for those burdened by life\'s worries, allowing you to share your struggles with a stranger and find comfort for your heart.',
            tagsPlaceholder: 'Enter a tag to chat with someone with the same tag',
            ctaButton: 'Find a Stranger',
            searchingButton: 'Searching...',
            aboutTitle: 'What is VoidChat?',
            aboutText: 'It is a simple platform and a safe space that allows you to engage in text-based, random, and completely anonymous conversations.',
            featuresTitle: 'Our Top Features',
            feature1: '<strong>Completely Anonymous:</strong> We do not ask for any personal information.',
            feature2: '<strong>Ephemeral Chats:</strong> For absolute privacy, all messages are deleted forever once the conversation ends.',
            feature3: '<strong>Smart Matching:</strong> Use a tag if you like. If you don\'t find anyone, change it or enter without a tag.',
            rulesTitle: 'Platform Rules',
            rule1: 'Maintain mutual respect and avoid any offensive language',
            rule2: 'To keep this space safe and pure, any form of profanity, insults, or misuse of this platform for prohibited acts is strictly forbidden. Remember that Allah is watching; every word you speak is recorded in your book of deeds.',
            rule3: 'Enjoy your experience and be a reason for making others\' experience enjoyable.',
            suggestionTitle: 'Have a suggestion to improve the site?',
            suggestionText: 'We listen to your opinions. Share your ideas to help us evolve.',
            suggestionPlaceholder: 'Write your suggestion here...',
            suggestionBtn: 'Send Suggestion',
            suggestionThanks: 'Thank you! Your suggestion has been sent successfully.',
            copyright: '© 2025 VoidChat. All rights reserved.',
            credit: 'Made with ❤️ by <a href="" target="_blank" class="credit-link">Developer</a>',
            chatPlaceholder: 'Type your message...',
            chatSendBtn: 'Send',
            statusSearching: 'Searching for a stranger',
            // الجمل الجديدة للتطابق
            statusMatchFoundTag: 'Connected with a partner sharing Tag: ',
            statusMatchFoundRandom: 'Connected with a stranger (No tag match found)',
            partnerTyping: 'Partner is typing...',
            partnerLeft: 'The stranger has left the conversation.',
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

        // تحديث الرسالة حسب نوع التطابق عند تغيير اللغة
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
        const message = inputField.value.trim();
        if (message && currentRoom) {
            socket.emit('chatMessage', { room: currentRoom, message: message });
            displayMessage(message, 'my-message');
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
        chatStatus.dataset.matchType = ''; // تنظيف المتغيرات
        chatStatus.dataset.matchedTag = ''; // تنظيف المتغيرات
    }

    // =================================
    // 3.5 حركة النقاط في "جارٍ البحث"
    // =================================
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
            const newTag = tagsInput.value.trim().toLowerCase(); // الحروف تتحول لصغيرة هنا أيضاً
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

    submitSuggestionBtn.addEventListener('click', () => {
        const suggestion = suggestionTextarea.value.trim();
        if (suggestion) {
            socket.emit('submitSuggestion', suggestion);
            suggestionTextarea.style.display = 'none';
            submitSuggestionBtn.style.display = 'none';
            suggestionThanksMsg.classList.remove('hidden');
        }
    });

    // =================================
    // 5. مستمعو أحداث الخادم (Socket Events)
    // =================================

    socket.on('waitingForPartner', () => {
        mainView.classList.add('hidden');
        chatView.classList.remove('hidden');
        chatStatus.textContent = translations[currentLang].statusSearching;
        chatStatus.dataset.keyStatus = 'statusSearching';
        chatStatus.dataset.matchType = ''; // تنظيف المتغير
        leaveButton.disabled = false;
        startDotAnimation();
    });

    // --- المنطق الجديد عند إيجاد شريك ---
    socket.on('matchFound', (data) => {
        stopDotAnimation();
        currentRoom = data.room;
        mainView.classList.add('hidden');
        chatView.classList.remove('hidden');
        
        // تحديد النص بناءً على نوع التطابق (هل كان بـ Tag أم عشوائي)
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

    socket.on('partnerLeft', () => {
        stopDotAnimation();
        displayMessage(translations[currentLang].partnerLeft, 'system-message');
        inputField.disabled = true;
        sendButton.disabled = true;
        chatStatus.textContent = translations[currentLang].partnerLeft;
        chatStatus.dataset.keyStatus = 'partnerLeft';
        chatStatus.dataset.matchType = '';
    });

    socket.on('partnerTyping', () => {
        chatStatus.textContent = translations[currentLang].partnerTyping;
        // لا نقوم بتحديث الـ dataset هنا لكي يبقى يحتفظ بنوع التطابق إذا غيرنا اللغة أثناء الكتابة
    });

    socket.on('partnerStoppedTyping', () => {
        // عند التوقف عن الكتابة، نرجع الرسالة الأصلية حسب نوع التطابق
        if (chatStatus.dataset.matchType === 'tag') {
            chatStatus.textContent = translations[currentLang].statusMatchFoundTag + chatStatus.dataset.matchedTag;
        } else if (chatStatus.dataset.matchType === 'random') {
            chatStatus.textContent = translations[currentLang].statusMatchFoundRandom;
        }
    });

    socket.on('chatMessage', (message) => {
        displayMessage(message, 'stranger-message');
    });

    // --- Android Back Button Handler ---
    if (window.Capacitor && Capacitor.isPluginAvailable('App')) {
        const { App } = Capacitor.Plugins;
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
    }
    
});