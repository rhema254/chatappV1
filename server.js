const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Connect to SQLite database
const db = new sqlite3.Database('./chat.db');

// Create users and messages tables if they don't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    sender INTEGER,
    receiver INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender) REFERENCES users(id),
    FOREIGN KEY(receiver) REFERENCES users(id)
)`);

// Middleware to parse JSON bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure session middleware
const sessionMiddleware = session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    store: new SQLiteStore()
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

app.use(express.static(__dirname + '/public'));

// Registration endpoint
app.post('/register', (req, res) => {
    const { username } = req.body;
    if (username) {
        db.run('INSERT INTO users (username) VALUES (?)', [username], (err) => {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).send('Username already exists');
                }
                return res.status(500).send('Server error');
            }
            req.session.username = username;
            req.session.save();
            res.status(200).send('User registered');
        });
    } else {
        res.status(400).send('Username is required');
    }
});

// Login endpoint
app.post('/login', (req, res) => {
    const { username } = req.body;
    if (username) {
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
            if (err) {
                return res.status(500).send('Server error');
            }
            if (!user) {
                return res.status(400).send('User not found');
            }
            req.session.username = username;
            req.session.save();
            res.status(200).send('Login successful');
        });
    } else {
        res.status(400).send('Username is required');
    }
});

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('get users', () => {
        db.all('SELECT username FROM users', (err, users) => {
            if (err) {
                console.error(err.message);
                return;
            }
            socket.emit('users', users);
        });
    });

    socket.on('get messages', (username) => {
        const loggedInUser = socket.request.session.username;
        if (loggedInUser) {
            db.all(`
                SELECT messages.content, sender_user.username as sender, receiver_user.username as receiver
                FROM messages
                JOIN users as sender_user ON messages.sender = sender_user.id
                JOIN users as receiver_user ON messages.receiver = receiver_user.id
                WHERE (sender_user.username = ? AND receiver_user.username = ?)
                OR (sender_user.username = ? AND receiver_user.username = ?)
                ORDER BY messages.timestamp
            `, [loggedInUser, username, username, loggedInUser], (err, rows) => {
                if (err) {
                    console.error(err.message);
                    return;
                }
                socket.emit('messages', rows);
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    socket.on('chat message', (msg) => {
        const loggedInUser = socket.request.session.username;
        if (loggedInUser) {
            const { content, username } = msg;
            db.get('SELECT id FROM users WHERE username = ?', [loggedInUser], (err, sender) => {
                if (err) {
                    console.error(err.message);
                    return;
                }
                db.get('SELECT id FROM users WHERE username = ?', [username], (err, receiver) => {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    if (sender && receiver) {
                        db.run('INSERT INTO messages (content, sender, receiver) VALUES (?, ?, ?)', [content, sender.id, receiver.id], (err) => {
                            if (err) {
                                console.error(err.message);
                                return;
                            }
                            // Broadcast the message to the correct recipient
                            io.emit('chat message', { content, sender: loggedInUser, receiver: username });
                        });
                    }
                });
            });
        }
    });

    socket.on('set username', (username) => {
        socket.request.session.username = username;
        socket.request.session.save();
    });
});

server.listen(3002, () => {
    console.log('listening on *:3002');
});
