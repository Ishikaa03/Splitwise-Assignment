require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const authenticate = require('./middleware/authenticate');

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/groups', authenticate, require('./routes/groups'));
app.use('/api/v1/expenses', authenticate, require('./routes/expenses'));
app.use('/api/v1/payments', authenticate, require('./routes/payments'));
app.use('/api/v1/messages', authenticate, require('./routes/messages'));

app.get('/health', (req, res) => res.json({ ok: true }));

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

require('./socket')(io);
app.set('io', io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
