import { useState, useEffect } from 'react';

interface Message {
  text: string;
  sender: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080');
    setWs(socket);

    socket.onmessage = async (event) => {
      let messageData: string;
      if (event.data instanceof Blob) {
        messageData = await event.data.text();
      } else {
        messageData = event.data;
      }
      const message = JSON.parse(messageData);
      setMessages((prevMessages) => [...prevMessages, message]);
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = () => {
    if (input.trim() && ws) {
      const message = { text: input, sender: 'You' };
      ws.send(JSON.stringify(message));
      setMessages([...messages, message]);
      setInput('');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Encrypted Chat</h1>
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
        <button onClick={sendMessage} style={{ padding: '10px' }}>Send</button>
      </div>
    </div>
  );
}