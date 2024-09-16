import { EventEmitter } from 'events';
import { PublicKey, Keypair } from '@solana/web3.js';
import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';

class ConnectionManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private isInitiator: boolean = false;
  private messageQueue: string[] = [];
  private encryptionKey: CryptoKey | null = null;
  private publicKey: string;
  private recipientPublicKey: string | null = null;
  private encryptionSetupComplete: boolean = false;
  private encryptionSetupInProgress: boolean = false;
  private solanaKeypair: Keypair;

  constructor(publicKey: string) {
    super();
    this.publicKey = publicKey;
    this.solanaKeypair = Keypair.generate(); // This is a temporary keypair for ECDH
  }

  async init() {
    await this.initWebSocket();
    this.registerWithServer();
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
        case 'ecdh-public-key':
          console.log('Received ECDH public key message');
          if (data.sender !== this.publicKey) {
            this.handleECDHPublicKey(data.key, data.sender);
          }
          break;
        case 'encryption-ready':
          if (data.sender === this.recipientPublicKey) {
            console.log('Received encryption ready confirmation from peer');
            this.encryptionSetupComplete = true;
            console.log('Emitting encryptionReady event');
            this.emit('encryptionReady');
          }
          break;
        case 'encrypted-message':
          this.handleEncryptedMessage(data.message);
          break;
        case 'initiate':
          if (data.recipient === this.publicKey) {
            console.log('Received initiate message');
            this.recipientPublicKey = data.sender;
            this.isInitiator = false;
            this.initializePeerConnection();
          }
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
        this.sendMessage(JSON.stringify({ 
          type: 'ice-candidate', 
          candidate: event.candidate,
          sender: this.publicKey,
          recipient: this.recipientPublicKey
        }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state changed:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'connected') {
        this.emit('peerConnectionEstablished');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed:', this.peerConnection?.iceConnectionState);
    };

    if (this.isInitiator) {
      console.log('Creating data channel');
      this.dataChannel = this.peerConnection.createDataChannel('chat');
      this.setupDataChannel();
      this.createOffer();
    } else {
      this.peerConnection.ondatachannel = (event) => {
        console.log('Received data channel');
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }

    this.initializeEncryption();
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel is open');
      this.emit('dataChannelReady');
    };

    this.dataChannel.onmessage = async (event) => {
      console.log('Received message from data channel:', event.data);
      try {
        const parsedData = JSON.parse(event.data);
        if (parsedData.type === 'encrypted-message') {
          try {
            const decryptedMessage = await this.decryptMessage(this.base64ToArrayBuffer(parsedData.message));
            this.emit('message', JSON.parse(decryptedMessage));
          } catch (decryptError) {
            console.error('Failed to decrypt message:', decryptError);
            this.emit('error', 'Failed to decrypt message');
          }
        }
      } catch (parseError) {
        console.error('Failed to parse message:', parseError);
        this.emit('error', 'Failed to parse message');
      }
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
      
      this.sendMessage(JSON.stringify({ 
        type: 'offer', 
        offer,
        sender: this.publicKey,
        recipient: this.recipientPublicKey
      }));
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
      this.sendMessage(JSON.stringify({ 
        type: 'answer', 
        answer,
        sender: this.publicKey,
        recipient: this.recipientPublicKey
      }));
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

  private async initializeEncryption() {
    if (this.encryptionSetupComplete) {
      console.log('Encryption setup already complete, skipping');
      return;
    }

    if (this.encryptionSetupInProgress) {
      console.log('Encryption setup already in progress, skipping');
      return;
    }

    this.encryptionSetupInProgress = true;

    console.log('Initializing encryption');
    try {
      const publicKeyBuffer = this.solanaKeypair.publicKey.toBytes();
      console.log('Generated Ed25519 public key:', Buffer.from(publicKeyBuffer).toString('hex'));

      console.log('Sending public key for ECDH');
      this.sendMessage(JSON.stringify({ 
        type: 'ecdh-public-key', 
        key: Buffer.from(publicKeyBuffer).toString('base64'),
        sender: this.publicKey,
        recipient: this.recipientPublicKey
      }));
    } catch (error) {
      console.error('Error in initializeEncryption:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      this.emit('error', `Failed to initialize encryption: ${error}`);
    } finally {
      this.encryptionSetupInProgress = false;
    }
  }

  private async handleECDHPublicKey(peerPublicKeyBase64: string, senderPublicKey: string) {
    console.log('Received peer ECDH public key from:', senderPublicKey);
    if (senderPublicKey === this.recipientPublicKey && !this.encryptionSetupComplete) {
      try {
        const peerPublicKeyBuffer = Buffer.from(peerPublicKeyBase64, 'base64');
        console.log('Peer public key:', peerPublicKeyBuffer.toString('hex'));

        const sharedSecret = await this.deriveSharedSecret(peerPublicKeyBuffer);
        console.log('Shared secret derived');

        await this.deriveEncryptionKey(sharedSecret);
        console.log('Encryption key derived');

        this.encryptionSetupComplete = true;
        console.log('Encryption setup complete, emitting encryptionReady event');
        this.emit('encryptionReady');

        // Send confirmation back to the other peer
        this.sendMessage(JSON.stringify({
          type: 'encryption-ready',
          sender: this.publicKey,
          recipient: this.recipientPublicKey
        }));
      } catch (error) {
        console.error('Error in handleECDHPublicKey:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
        this.emit('error', `Failed to setup encryption: ${error}`);
      }
    } else {
      console.log('Received ECDH public key from non-recipient or encryption already set up, ignoring');
    }
  }

  private async deriveSharedSecret(peerPublicKey: Buffer): Promise<Uint8Array> {
    console.log('Deriving shared secret');
    try {
      const privateKey = this.solanaKeypair.secretKey.slice(0, 32);
      console.log('Private key length:', privateKey.length);
      console.log('Peer public key length:', peerPublicKey.length);

      if (privateKey.length !== 32 || peerPublicKey.length !== 32) {
        throw new Error('Invalid key length');
      }

      // Derive the shared secret using Ed25519
      const sharedSecret = await ed25519.getSharedSecret(privateKey, peerPublicKey);
      console.log('Shared secret derived, length:', sharedSecret.length);

      // Hash the shared secret to get a 256-bit key
      const hashedSecret = sha256(sharedSecret);
      console.log('Shared secret hashed, length:', hashedSecret.length);

      return hashedSecret;
    } catch (error) {
      console.error('Error in deriveSharedSecret:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error(`Failed to derive shared secret: ${error}`);
    }
  }

  private async deriveEncryptionKey(sharedSecret: Uint8Array) {
    console.log('Deriving encryption key');
    try {
      this.encryptionKey = await window.crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      console.log('Encryption key imported');
    } catch (error) {
      console.error('Error in deriveEncryptionKey:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error(`Failed to derive encryption key: ${error}`);
    }
  }

  private async encryptMessage(message: string): Promise<ArrayBuffer> {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not set");
    }

    const encodedMessage = new TextEncoder().encode(message);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    try {
      const encryptedData = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        this.encryptionKey,
        encodedMessage
      );

      const result = new Uint8Array(iv.length + encryptedData.byteLength);
      result.set(iv, 0);
      result.set(new Uint8Array(encryptedData), iv.length);

      return result.buffer;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt message');
    }
  }

  private async decryptMessage(encryptedData: ArrayBuffer): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not set");
    }

    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);

    try {
      const decryptedData = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        this.encryptionKey,
        data
      );
      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt message');
    }
  }

  private async handleEncryptedMessage(encryptedMessage: string) {
    try {
      const decryptedMessage = await this.decryptMessage(this.base64ToArrayBuffer(encryptedMessage));
      this.emit('message', JSON.parse(decryptedMessage));
    } catch (error) {
      console.error('Failed to handle encrypted message:', error);
      this.emit('error', 'Failed to handle encrypted message');
    }
  }

  async sendChatMessage(message: string, recipientPublicKey: string) {
    if (this.dataChannel && this.dataChannel.readyState === 'open' && this.encryptionKey) {
      try {
        const encryptedMessage = await this.encryptMessage(JSON.stringify({ 
          text: message, 
          sender: this.publicKey,
          recipient: recipientPublicKey
        }));
        const base64Message = this.arrayBufferToBase64(encryptedMessage);
        this.dataChannel.send(JSON.stringify({ type: 'encrypted-message', message: base64Message }));
        console.log('Encrypted message sent successfully');
      } catch (error) {
        console.error('Failed to send encrypted message:', error);
        this.emit('error', 'Failed to send encrypted message');
      }
    } else {
      console.error('Data channel is not open or encryption is not ready');
      this.emit('error', 'Data channel is not open or encryption is not ready');
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer) as any);
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  setRecipientPublicKey(publicKey: string) {
    console.log('Setting recipient public key:', publicKey);
    this.recipientPublicKey = publicKey;
    this.isInitiator = true;
    this.encryptionSetupComplete = false; // Reset encryption setup
    this.initiatePeerConnection();
    this.initializeEncryption(); // Start the encryption setup process
  }

  private initiatePeerConnection() {
    if (!this.recipientPublicKey) {
      console.error('Recipient public key not set');
      return;
    }

    this.initializePeerConnection();
    this.sendMessage(JSON.stringify({
      type: 'initiate',
      sender: this.publicKey,
      recipient: this.recipientPublicKey
    }));
  }

  private registerWithServer() {
    this.sendMessage(JSON.stringify({
      type: 'register',
      publicKey: this.publicKey
    }));
  }

  cleanup() {
    if (this.ws) {
      this.ws.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.dataChannel) {
      this.dataChannel.close();
    }
  }
}

export default ConnectionManager;