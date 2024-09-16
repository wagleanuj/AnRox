import { EventEmitter } from 'events';

class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(url: string) {
    super();
    this.url = url;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => this.emit('open');
    this.ws.onmessage = (event) => this.emit('message', event.data);
    this.ws.onerror = (error) => this.emit('error', error);
    this.ws.onclose = () => this.emit('close');
  }

  send(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      throw new Error('WebSocket is not open');
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default WebSocketService;