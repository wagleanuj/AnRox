import { EventEmitter } from 'events';

class ConnectionManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private isInitiator: boolean = false;
  private messageQueue: string[] = [];

  constructor() {
    super();
  }

  async init() {
    await this.initWebSocket();
    // WebSocket is now open, wait for 'init' message before initializing peer connection
  }

  private async initWebSocket() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket('ws://localhost:8080');

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.sendQueuedMessages();
        resolve();
      };

      this.ws.onmessage = this.handleWebSocketMessage.bind(this);

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.emit('error', 'Connection to the server was closed');
      };
    });
  }

  private handleWebSocketMessage(event: MessageEvent) {
    console.log('Raw message received:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed message:', data);
      
      switch (data.type) {
        case 'init':
          this.isInitiator = data.isInitiator;
          console.log(`Received init message. isInitiator: ${this.isInitiator}`);
          this.initializePeerConnection();
          break;
        case 'offer':
          console.log('Received offer');
          this.handleOffer(data.offer);
          break;
        case 'answer':
          console.log('Received answer');
          this.handleAnswer(data.answer);
          break;
        case 'ice-candidate':
          console.log('Received ICE candidate');
          this.handleNewICECandidate(data.candidate);
          break;
        case 'error':
          this.emit('error', data.message);
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  private initializePeerConnection() {
    console.log('Initializing peer connection');
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        this.sendMessage(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state changed:', this.peerConnection?.connectionState);
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed:', this.peerConnection?.iceConnectionState);
    };

    if (this.isInitiator) {
      console.log('Creating data channel');
      this.dataChannel = this.peerConnection.createDataChannel('chat');
      this.setupDataChannel();
    } else {
      this.peerConnection.ondatachannel = (event) => {
        console.log('Received data channel');
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }

    if (this.isInitiator) {
      setTimeout(() => this.createOffer(), 1000);
    }
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel is open');
      this.emit('dataChannelReady');
    };

    this.dataChannel.onmessage = (event) => {
      console.log('Received message from data channel:', event.data);
      this.emit('message', JSON.parse(event.data));
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel is closed');
      this.emit('dataChannelClosed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.emit('error', 'Data channel error');
    };
  }

  private async createOffer() {
    console.log('Creating offer');
    try {
      if (!this.peerConnection) {
        console.error('PeerConnection is not initialized');
        return;
      }
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.sendMessage(JSON.stringify({ type: 'offer', offer }));
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    console.log('Handling offer');
    try {
      if (!this.peerConnection) {
        console.error('PeerConnection is not initialized');
        return;
      }
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.sendMessage(JSON.stringify({ type: 'answer', answer }));
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    console.log('Handling answer');
    try {
      if (!this.peerConnection) {
        console.error('PeerConnection is not initialized');
        return;
      }
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  private async handleNewICECandidate(candidate: RTCIceCandidateInit) {
    console.log('Handling ICE candidate');
    try {
      if (!this.peerConnection) {
        console.error('PeerConnection is not initialized');
        return;
      }
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ice candidate', e);
    }
  }

  private sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      console.log('Message sent:', message);
    } else {
      console.log('WebSocket not ready, queueing message');
      this.messageQueue.push(message);
    }
  }

  private sendQueuedMessages() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message && this.ws) {
        this.ws.send(message);
        console.log('Queued message sent:', message);
      }
    }
  }

  sendChatMessage(message: string) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ text: message, sender: 'You' }));
    } else {
      console.error('Data channel is not open');
    }
  }
}

export default ConnectionManager;