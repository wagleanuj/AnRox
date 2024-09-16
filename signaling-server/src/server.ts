import WebSocket, { WebSocketServer } from 'ws';

interface Client {
  ws: WebSocket;
  publicKey: string;
}

const wss = new WebSocketServer({ port: 8080 });
const clients: Client[] = [];

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  ws.on('message', (message: WebSocket.RawData) => {
    const messageString = message.toString();
    console.log('Received:', messageString);
    try {
      const parsedMessage = JSON.parse(messageString);
      console.log('Parsed message type:', parsedMessage.type);
      
      switch (parsedMessage.type) {
        case 'register':
          registerClient(ws, parsedMessage.publicKey);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
        case 'ecdh-public-key':  // Change this from 'public-key' to 'ecdh-public-key'
        case 'initiate':
        case 'encryption-ready':  // Add this case
          relayMessage(parsedMessage);
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    const index = clients.findIndex(client => client.ws === ws);
    if (index > -1) {
      clients.splice(index, 1);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function registerClient(ws: WebSocket, publicKey: string) {
  const existingClient = clients.find(client => client.publicKey === publicKey);
  if (existingClient) {
    existingClient.ws = ws;
  } else {
    clients.push({ ws, publicKey });
  }
  console.log(`Registered client with public key: ${publicKey}`);
  console.log(`Total clients connected: ${clients.length}`);
}

function relayMessage(message: any) {
  if (!message.recipient) {
    console.log(`Message type '${message.type}' doesn't have a recipient, broadcasting to all clients`);
    clients.forEach(client => {
      if (client.publicKey !== message.sender) {
        client.ws.send(JSON.stringify(message));
      }
    });
    return;
  }

  console.log(`Attempting to relay message to: ${message.recipient}`);
  console.log(`Current clients: ${clients.map(c => c.publicKey).join(', ')}`);
  const recipientClient = clients.find(client => client.publicKey === message.recipient);
  if (recipientClient) {
    recipientClient.ws.send(JSON.stringify(message));
    console.log(`Relayed message to recipient: ${message.recipient}`);
  } else {
    console.log(`Recipient not found: ${message.recipient}`);
  }
}

wss.on('listening', () => {
  console.log('Signaling server is running on ws://localhost:8080');
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});