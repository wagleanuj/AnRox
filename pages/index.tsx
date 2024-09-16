import { useState, useEffect, useRef } from 'react';
import ConnectionManager from '../utils/ConnectionManager';

interface Message {
  text: string;
  sender: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [isDataChannelReady, setIsDataChannelReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const connectionManager = useRef<ConnectionManager | null>(null);

  useEffect(() => {
    connectionManager.current = new ConnectionManager();
    
    connectionManager.current.on('message', (message: Message) => {
      setMessages(prevMessages => [...prevMessages, message]);
    });

    connectionManager.current.on('dataChannelReady', () => {
      setIsDataChannelReady(true);
    });

    connectionManager.current.on('dataChannelClosed', () => {
      setIsDataChannelReady(false);
    });

    connectionManager.current.on('error', (errorMessage: string) => {
      setError(errorMessage);
    });

    connectionManager.current.init().catch((error) => {
      console.error('Failed to initialize connection:', error);
      setError('Failed to connect to the server');
    });

    return () => {
      // Clean up the connection manager if needed
    };
  }, []);

  const sendChatMessage = () => {
    if (input.trim() && isDataChannelReady && connectionManager.current) {
      connectionManager.current.sendChatMessage(input);
      setMessages(prevMessages => [...prevMessages, { text: input, sender: 'You' }]);
      setInput('');
    } else if (!isDataChannelReady) {
      console.log('Data channel is not ready yet');
      setMessages(prevMessages => [...prevMessages, { text: 'Connecting...', sender: 'System' }]);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Encrypted Chat</h1>
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: '80%', padding: '10px' }}
            />
            <button onClick={sendChatMessage} style={{ padding: '10px' }} disabled={!isDataChannelReady}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}