import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const clients: WebSocket[] = [];

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  if (clients.length >= 2) {
    console.log('Room is full');
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    ws.close();
    return;
  }

  clients.push(ws);

  const isInitiator = clients.length === 1;
  ws.send(JSON.stringify({ type: 'init', isInitiator }));
  console.log(`Sent init message. isInitiator: ${isInitiator}`);

  ws.on('message', (message: WebSocket.RawData) => {
    const messageString = message.toString();
    console.log('Received:', messageString);
    try {
      const parsedMessage = JSON.parse(messageString);
      console.log('Parsed message type:', parsedMessage.type);
      
      // Relay the message to the other client
      const otherClient = clients.find(client => client !== ws);
      if (otherClient) {
        console.log('Relaying message to other client');
        otherClient.send(messageString);
      } else {
        console.log('No other client to send message to');
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    const index = clients.indexOf(ws);
    if (index > -1) {
      clients.splice(index, 1);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

wss.on('listening', () => {
  console.log('Signaling server is running on ws://localhost:8080');
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});