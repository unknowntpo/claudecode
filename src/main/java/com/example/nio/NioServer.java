package com.example.nio;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.util.Iterator;
import java.util.Set;

/**
 * Demonstrates Java NIO Selector and ServerSocketChannel usage.
 * This server can handle multiple clients concurrently using a single thread.
 */
public class NioServer {
    private static final int BUFFER_SIZE = 256;
    private static final int PORT = 8080;

    private Selector selector;
    private ServerSocketChannel serverSocketChannel;
    private volatile boolean running = true;

    public NioServer() throws IOException {
        // Create Selector - the core of NIO multiplexing
        this.selector = Selector.open();

        // Create ServerSocketChannel and configure it
        this.serverSocketChannel = ServerSocketChannel.open();
        this.serverSocketChannel.bind(new InetSocketAddress(PORT));

        // Non-blocking mode is essential for working with Selector
        this.serverSocketChannel.configureBlocking(false);

        // Register the channel with selector for ACCEPT operations
        this.serverSocketChannel.register(selector, SelectionKey.OP_ACCEPT);

        System.out.println("NIO Server started on port " + PORT);
    }

    public void start() throws IOException {
        while (running) {
            // Block until at least one channel is ready for I/O
            // Returns the number of keys whose ready sets were updated
            int readyChannels = selector.select();

            if (readyChannels == 0) {
                continue;
            }

            // Get the set of keys for channels that are ready
            Set<SelectionKey> selectedKeys = selector.selectedKeys();
            Iterator<SelectionKey> keyIterator = selectedKeys.iterator();

            while (keyIterator.hasNext()) {
                SelectionKey key = keyIterator.next();

                try {
                    // Handle different types of events
                    if (key.isAcceptable()) {
                        handleAccept(key);
                    } else if (key.isReadable()) {
                        handleRead(key);
                    } else if (key.isWritable()) {
                        handleWrite(key);
                    }
                } catch (IOException e) {
                    System.err.println("Error handling key: " + e.getMessage());
                    key.cancel();
                    key.channel().close();
                }

                // Remove the key from selected set - it's been processed
                keyIterator.remove();
            }
        }
    }

    private void handleAccept(SelectionKey key) throws IOException {
        // Get the ServerSocketChannel for which this key was created
        ServerSocketChannel serverChannel = (ServerSocketChannel) key.channel();

        // Accept the connection - returns a SocketChannel
        SocketChannel clientChannel = serverChannel.accept();

        if (clientChannel != null) {
            clientChannel.configureBlocking(false);

            // Register the new client channel for READ operations
            clientChannel.register(selector, SelectionKey.OP_READ);

            System.out.println("New client connected: " + clientChannel.getRemoteAddress());
        }
    }

    private void handleRead(SelectionKey key) throws IOException {
        SocketChannel clientChannel = (SocketChannel) key.channel();
        ByteBuffer buffer = ByteBuffer.allocate(BUFFER_SIZE);

        int bytesRead = clientChannel.read(buffer);

        if (bytesRead == -1) {
            // Client closed connection
            System.out.println("Client disconnected: " + clientChannel.getRemoteAddress());
            key.cancel();
            clientChannel.close();
            return;
        }

        if (bytesRead > 0) {
            // Prepare buffer for reading
            buffer.flip();

            // Read the data
            byte[] data = new byte[buffer.remaining()];
            buffer.get(data);
            String message = new String(data).trim();

            System.out.println("Received from client: " + message);

            // Prepare echo response
            String response = "Echo: " + message + "\n";
            buffer.clear();
            buffer.put(response.getBytes());
            buffer.flip();

            // Attach buffer to key for writing
            key.attach(buffer);

            // Register for WRITE operation
            key.interestOps(SelectionKey.OP_WRITE);
        }
    }

    private void handleWrite(SelectionKey key) throws IOException {
        SocketChannel clientChannel = (SocketChannel) key.channel();
        ByteBuffer buffer = (ByteBuffer) key.attachment();

        if (buffer != null && buffer.hasRemaining()) {
            clientChannel.write(buffer);
        }

        if (!buffer.hasRemaining()) {
            // Done writing, switch back to reading
            key.attach(null);
            key.interestOps(SelectionKey.OP_READ);
        }
    }

    public void stop() throws IOException {
        running = false;
        selector.wakeup();
        serverSocketChannel.close();
        selector.close();
        System.out.println("Server stopped");
    }

    public static void main(String[] args) {
        try {
            NioServer server = new NioServer();

            // Add shutdown hook for graceful shutdown
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    server.stop();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }));

            server.start();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
