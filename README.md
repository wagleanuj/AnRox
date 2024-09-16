# Encrypted Chat with Solana Wallet Integration

This project is an end-to-end encrypted chat application that uses WebRTC for peer-to-peer communication and Solana wallets for authentication. It features a Next.js frontend and a TypeScript-based signaling server.

## Features

- End-to-end encryption using Ed25519 key exchange
- WebRTC peer-to-peer communication
- Solana wallet integration for authentication
- Real-time chat functionality
- Signaling server for WebRTC connection establishment

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- A Solana wallet (e.g., Phantom, Solflare)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/encrypted-chat.git
   cd encrypted-chat
   ```

2. Install dependencies for the frontend:
   ```
   npm install
   ```

3. Install dependencies for the signaling server:
   ```
   cd signaling-server
   npm install
   cd ..
   ```

## Running the Application

1. Start the signaling server:
   ```
   cd signaling-server
   npm start
   ```
   The server will run on `ws://localhost:8080`.

2. In a new terminal, start the frontend development server:
   ```
   npm run dev
   ```
   The frontend will be available at `http://localhost:3000`.

3. Open two browser windows and navigate to `http://localhost:3000` in each.

4. Connect your Solana wallet in each window.

5. In one window, enter the recipient's public key and click "Connect to Recipient".

6. Once connected, you can start sending encrypted messages between the two clients.

## Usage

1. Connect your Solana wallet using the "Select Wallet" button.
2. Enter the recipient's Solana public key in the input field.
3. Click "Connect to Recipient" to establish a peer connection.
4. Once connected, you can send and receive encrypted messages.

## Security Note

This application uses a temporary Ed25519 keypair for the encryption key exchange, which is separate from your Solana wallet keys. Your Solana private key is never exposed or used for message encryption.

## Development

- The frontend code is located in the root directory, with the main page in `pages/index.tsx`.
- The `ConnectionManager` class in `utils/ConnectionManager.ts` handles the WebRTC and encryption logic.
- The signaling server code is in the `signaling-server` directory.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).