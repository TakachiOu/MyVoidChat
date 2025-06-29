// script.js - Final Clean Version
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let currentRoom = '';
    let typingTimer;
    const typingTimeout = 1500;
    const tags = new Set();
    const translations = { 'ar': { statusMatchFound: 'تم الاتصال بغريب. ابدأ المحادثة!', partnerTyping: 'شريكك يكتب الآن...', partnerLeft: 'لقد غادر الغريب المحادثة.', statusSearching: 'جارٍ البحث عن غريب...' } };
    let currentLang = 'ar';

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
        ctaButton.querySelector('span').textContent = "ابحث عن شخص";
        ctaButton.disabled = false;
        messagesArea.innerHTML = '';
        inputField.disabled = true;
        sendButton.disabled = true;
        if(leaveButton) { leaveButton.disabled = true; } // Check if leaveButton exists
        currentRoom = '';
    }

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
        ctaButton.querySelector('span').textContent = "جارٍ البحث...";
        ctaButton.disabled = true;
        socket.emit('findPartner', Array.from(tags));
    });

    sendButton.addEventListener('click', sendMessage);
    inputField.addEventListener('keyup', (event) => { if (event.key === 'Enter') sendMessage(); });

    if(inputField) {
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
    }
    
    if(leaveButton) {
        leaveButton.addEventListener('click', () => {
            if (currentRoom) {
                socket.emit('leaveRoom', currentRoom);
            } else {
                socket.emit('cancelSearch');
            }
            resetChatState();
        });
    }

    socket.on('waitingForPartner', () => {
        mainView.classList.add('hidden');
        chatView.classList.remove('hidden');
        chatStatus.textContent = translations[currentLang].statusSearching;
        if(leaveButton) { leaveButton.disabled = false; }
    });

    socket.on('matchFound', (data) => {
        currentRoom = data.room;
        mainView.classList.add('hidden');
        chatView.classList.remove('hidden');
        chatStatus.textContent = translations[currentLang].statusMatchFound;
        inputField.disabled = false;
        sendButton.disabled = false;
        if(leaveButton) { leaveButton.disabled = false; }
        inputField.focus();
    });

    socket.on('partnerLeft', () => {
        displayMessage(translations[currentLang].partnerLeft, 'system-message');
        inputField.disabled = true;
        sendButton.disabled = true;
        chatStatus.textContent = translations[currentLang].partnerLeft;
    });

    socket.on('partnerTyping', () => {
        chatStatus.textContent = translations[currentLang].partnerTyping;
    });

    socket.on('partnerStoppedTyping', () => {
        chatStatus.textContent = translations[currentLang].statusMatchFound;
    });
    
    socket.on('chatMessage', (message) => {
        displayMessage(message, 'stranger-message');
    });
});