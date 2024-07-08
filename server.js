const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 4000;

// Enable CORS for all origins
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Socket connections
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('join-room', ({ roomId, userName }) => {
    console.log(`${userName} joined room: ${roomId}`);
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { userId: socket.id, userName });

    socket.on('sending-signal', (payload) => {
      console.log(`Sending signal from ${payload.callerId} to ${payload.userIdToSignal}`);
      io.to(payload.userIdToSignal).emit('receiving-signal', { signal: payload.signal, callerId: payload.callerId });
    });

    socket.on('returning-signal', (payload) => {
      console.log(`Returning signal from ${socket.id} to ${payload.callerId}`);
      io.to(payload.callerId).emit('receiving-returned-signal', { signal: payload.signal, id: socket.id });
    });

    socket.on('send-message', ({ roomId, message }) => {
      console.log(`Message from ${socket.id} in room ${roomId}: ${message}`);
      io.to(roomId).emit('receive-message', message);
    });

    socket.on('leave-room', ({ roomId }) => {
      console.log(`${socket.id} leaving room: ${roomId}`);
      socket.leave(roomId);
      socket.to(roomId).emit('user-left', socket.id);
    });

    socket.on('disconnect', () => {
      console.log(`${socket.id} disconnected`);
      socket.to(roomId).emit('user-left', socket.id);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));
