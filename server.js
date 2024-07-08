const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cluster = require('cluster');
const os = require('os');
const { setupMaster, setupWorker } = require('@socket.io/sticky');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

const numCPUs = os.cpus().length;
const PORT = process.env.PORT || 4000;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  const httpServer = http.createServer();

  // Setup sticky sessions
  setupMaster(httpServer, {
    loadBalancingMethod: 'least-connection',
  });

  // Setup connections between the workers
  setupPrimary();

  // Needed for packets containing buffers (you can ignore it if you only send plaintext objects)
  if (process.version.startsWith('v16') || process.version.startsWith('v17')) {
    cluster.setupPrimary({
      serialization: 'advanced',
    });
  } else {
    cluster.setupMaster({
      serialization: 'advanced',
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  console.log(`Worker ${process.pid} started`);

  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: ['http://localhost:3000', 'https://your-frontend-domain.web.app', 'https://video-meeting-server-three.vercel.app'],
      methods: ['GET', 'POST']
    }
  });

  // Use the cluster adapter
  io.adapter(createAdapter());

  // Setup connection with the primary process
  setupWorker(io);

  // Enable CORS for all origins
  app.use(cors({
    origin: ['http://localhost:3000', 'https://your-frontend-domain.web.app', 'https://video-meeting-server-three.vercel.app']
  }));

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

  server.listen(PORT, '0.0.0.0', () => console.log(`Worker server is running on port ${PORT}`));
}
