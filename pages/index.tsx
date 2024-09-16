import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import ConnectionManager from '../utils/ConnectionManager';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

interface Message {
  text: string;
  sender: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [isDataChannelReady, setIsDataChannelReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEncryptionReady, setIsEncryptionReady] = useState<boolean>(false);
  const [recipientPublicKey, setRecipientPublicKey] = useState<string>('');
  const [isPeerConnectionInitiated, setIsPeerConnectionInitiated] = useState<boolean>(false);
  const [isPeerConnectionEstablished, setIsPeerConnectionEstablished] = useState<boolean>(false);
  const connectionManager = useRef<ConnectionManager | null>(null);
  const { publicKey, connected, disconnect } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [serverStatus, setServerStatus] = useState<string>('Disconnected');
  const [encryptionStatus, setEncryptionStatus] = useState<string>('Not ready');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prevLogs => [...prevLogs, `${new Date().toISOString()}: ${message}`]);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (connected && publicKey) {
      const manager = new ConnectionManager(publicKey.toBase58());
      connectionManager.current = manager;

      manager.on('message', (message: Message) => {
        setMessages(prevMessages => [...prevMessages, message]);
        addLog(`Received message: ${JSON.stringify(message)}`);
      });

      manager.on('dataChannelReady', () => {
        setIsDataChannelReady(true);
        setConnectionStatus('Connected to peer');
        addLog('Data channel ready');
      });

      manager.on('dataChannelClosed', () => {
        setIsDataChannelReady(false);
        setConnectionStatus('Disconnected from peer');
        setEncryptionStatus('Not ready');
        addLog('Data channel closed');
      });

      manager.on('error', (errorMessage: string) => {
        setError(errorMessage);
        setConnectionStatus('Error');
        setMessages(prevMessages => [...prevMessages, { text: `Error: ${errorMessage}`, sender: 'System' }]);
        addLog(`Error: ${errorMessage}`);
      });

      manager.on('encryptionReady', () => {
        console.log('Encryption is ready');
        setIsEncryptionReady(true);
        setEncryptionStatus('Ready');
        addLog('Encryption is ready');
      });

      manager.on('peerConnectionEstablished', () => {
        console.log('Peer connection established');
        setIsPeerConnectionEstablished(true);
        addLog('Peer connection established');
      });

      manager.on('serverConnected', () => {
        setServerStatus('Connected to server');
        addLog('Connected to server');
      });

      manager.on('serverDisconnected', () => {
        setServerStatus('Disconnected from server');
        addLog('Disconnected from server');
      });

      manager.init().catch((error) => {
        console.error('Failed to initialize connection:', error);
        setError('Failed to connect to the server');
        setServerStatus('Error connecting to server');
        addLog(`Failed to initialize connection: ${error.message}`);
      });
    }

    return () => {
      if (connectionManager.current) {
        connectionManager.current.cleanup();
      }
    };
  }, [connected, publicKey]);

  const initiatePeerConnection = () => {
    if (connectionManager.current && recipientPublicKey) {
      addLog(`Initiating peer connection with ${recipientPublicKey}`);
      setEncryptionStatus('Setting up...');
      setIsEncryptionReady(false);
      connectionManager.current.setRecipientPublicKey(recipientPublicKey);
      setIsPeerConnectionInitiated(true);
      setConnectionStatus('Connecting...');
    }
  };

  const sendChatMessage = async () => {
    if (input.trim() && isDataChannelReady && isEncryptionReady && connectionManager.current) {
      await connectionManager.current.sendChatMessage(input, recipientPublicKey);
      setMessages(prevMessages => [...prevMessages, { text: input, sender: 'You' }]);
      setInput('');
    } else if (!isDataChannelReady) {
      console.log('Data channel is not ready yet');
      setMessages(prevMessages => [...prevMessages, { text: 'Connecting...', sender: 'System' }]);
    } else if (!isEncryptionReady) {
      console.log('Encryption is not ready yet');
      setMessages(prevMessages => [...prevMessages, { text: 'Setting up encryption...', sender: 'System' }]);
    }
  };

  const copyWalletAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Encrypted Chat</h1>
      <WalletMultiButtonDynamic />
      {connected && publicKey && (
        <>
          <button onClick={disconnect}>Disconnect</button>
          <button onClick={copyWalletAddress}>Copy Wallet Address</button>
          <p>Your public key: {publicKey.toBase58()}</p>
        </>
      )}
      {error ? (
        <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>
      ) : (
        <>
          <div style={{ border: '1px solid #ccc', padding: '10px', height: '300px', overflowY: 'scroll' }}>
            {messages.map((msg, index) => (
              <div key={index} style={{ margin: '10px 0' }}>
                <strong>{msg.sender}:</strong> {msg.text}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px' }}>
            <input
              type="text"
              value={recipientPublicKey}
              onChange={(e) => setRecipientPublicKey(e.target.value)}
              placeholder="Recipient's Public Key"
              style={{ width: '80%', padding: '10px', marginBottom: '10px' }}
            />
            <button onClick={initiatePeerConnection} disabled={!recipientPublicKey || isPeerConnectionInitiated}>
              Connect to Recipient
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: '80%', padding: '10px' }}
            />
            <button 
              onClick={sendChatMessage} 
              style={{ padding: '10px' }} 
              disabled={!isDataChannelReady || !connected || !isEncryptionReady || !isPeerConnectionEstablished}
            >
              Send
            </button>
          </div>
          <p>Server Status: {serverStatus}</p>
          <p>Peer Connection Status: {connectionStatus}</p>
          <p>Encryption Status: {encryptionStatus}</p>
          <p>Data Channel Ready: {isDataChannelReady ? 'Yes' : 'No'}</p>
          <p>Peer Connection Established: {isPeerConnectionEstablished ? 'Yes' : 'No'}</p>
        </>
      )}
      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px', height: '200px', overflowY: 'scroll' }}>
        <h3>Logs:</h3>
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
}