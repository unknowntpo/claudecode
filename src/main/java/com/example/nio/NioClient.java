package com.example.nio;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;

/**
 * Demonstrates Java NIO SocketChannel usage.
 * This client connects to the NIO server and sends messages.
 */
public class NioClient {
    private static final String HOST = "localhost";
    private static final int PORT = 8080;
    private static final int BUFFER_SIZE = 256;

    private SocketChannel socketChannel;

    public void connect() throws IOException {
        // Open a SocketChannel
        socketChannel = SocketChannel.open();

        // Connect to the server
        socketChannel.connect(new InetSocketAddress(HOST, PORT));

        System.out.println("Connected to server at " + HOST + ":" + PORT);
    }

    public void sendMessage(String message) throws IOException {
        if (socketChannel == null || !socketChannel.isConnected()) {
            throw new IllegalStateException("Not connected to server");
        }

        // Prepare the message
        ByteBuffer buffer = ByteBuffer.allocate(BUFFER_SIZE);
        buffer.put(message.getBytes(StandardCharsets.UTF_8));

        // Prepare buffer for writing (flip from write mode to read mode)
        buffer.flip();

        // Write to channel
        int bytesWritten = socketChannel.write(buffer);
        System.out.println("Sent " + bytesWritten + " bytes: " + message);
    }

    public String receiveMessage() throws IOException {
        if (socketChannel == null || !socketChannel.isConnected()) {
            throw new IllegalStateException("Not connected to server");
        }

        ByteBuffer buffer = ByteBuffer.allocate(BUFFER_SIZE);

        // Read from channel
        int bytesRead = socketChannel.read(buffer);

        if (bytesRead == -1) {
            throw new IOException("Server closed connection");
        }

        // Prepare buffer for reading
        buffer.flip();

        // Convert buffer to string
        byte[] data = new byte[buffer.remaining()];
        buffer.get(data);
        String response = new String(data, StandardCharsets.UTF_8).trim();

        System.out.println("Received " + bytesRead + " bytes: " + response);

        return response;
    }

    public void close() throws IOException {
        if (socketChannel != null) {
            socketChannel.close();
            System.out.println("Connection closed");
        }
    }

    public static void main(String[] args) {
        NioClient client = new NioClient();

        try {
            // Connect to server
            client.connect();

            // Send multiple messages
            String[] messages = {
                "Hello, NIO Server!",
                "This is message 2",
                "Testing Java NIO Channels",
                "Goodbye!"
            };

            for (String message : messages) {
                client.sendMessage(message);
                String response = client.receiveMessage();
                System.out.println("Server responded: " + response);
                System.out.println("---");

                // Small delay between messages
                Thread.sleep(1000);
            }

        } catch (IOException | InterruptedException e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        } finally {
            try {
                client.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
