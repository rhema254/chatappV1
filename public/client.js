const socket = io();

const authContainer = document.getElementById('auth-container');
const authUsername = document.getElementById('auth-username');
const registerButton = document.getElementById('register-button');
const loginButton = document.getElementById('login-button');
const authMessage = document.getElementById('auth-message');
const chatBox = document.getElementById('chat-box');
const chatList = document.getElementById('chat-list');
const chatListContainer = document.getElementById('chat-list-container');
const chatContainer = document.getElementById('chat-container');
const chatUsername = document.getElementById('chat-username');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

let loggedInUsername = null;
let currentChatUsername = null;

registerButton.addEventListener('click', () => {
    const username = authUsername.value;
    if (username) {
        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        })
        .then(response => response.text())
        .then(message => {
            authMessage.textContent = message;
            if (message === 'User registered') {
                authContainer.style.display = 'none';
                chatListContainer.style.display = 'block';
                socket.emit('get users');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});

loginButton.addEventListener('click', () => {
    const username = authUsername.value;
    if (username) {
        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        })
        .then(response => response.text())
        .then(message => {
            authMessage.textContent = message;
            if (message === 'Login successful') {
                loggedInUsername = username;
                authContainer.style.display = 'none';
                chatListContainer.style.display = 'block';
                socket.emit('get users');
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});

// Fetch initial chat list
socket.on('users', (users) => {
    chatList.innerHTML = '';
    users.forEach((user) => {
        if (user.username !== loggedInUsername) {
            const userItem = document.createElement('div');
            userItem.classList.add('chat-list-item');
            userItem.textContent = user.username;
            userItem.addEventListener('click', () => {
                currentChatUsername = user.username;
                chatUsername.textContent = currentChatUsername;
                chatListContainer.style.display = 'none';
                chatContainer.style.display = 'block';
                socket.emit('get messages', user.username);
            });
            chatList.appendChild(userItem);
        }
    });
});

// Display messages for the selected user
socket.on('messages', (messages) => {
    chatBox.innerHTML = '';
    messages.forEach((msg) => {
        const messageType = msg.sender === loggedInUsername ? 'sent' : 'received';
        addMessageToChatBox(msg.content, messageType, msg.sender);
    });
});

sendButton.addEventListener('click', () => {
    const message = messageInput.value;
    if (currentChatUsername && message) {
        socket.emit('chat message', { content: message, username: currentChatUsername });
        messageInput.value = '';
    }
});

socket.on('chat message', (data) => {
    if (data.receiver === loggedInUsername) {
        addMessageToChatBox(data.content, 'received', data.sender);
    } else if (data.sender === loggedInUsername && data.receiver === currentChatUsername) {
        addMessageToChatBox(data.content, 'sent', data.sender);
    }
});

function addMessageToChatBox(message, type, username) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);
    messageElement.textContent = `${username}: ${message}`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}
