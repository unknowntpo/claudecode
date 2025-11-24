package com.example.nio;

import java.io.IOException;

/**
 * Main entry point for the Java NIO Selector and Channel demo.
 * Provides options to run either the server or client.
 */
public class Main {
    public static void main(String[] args) {
        if (args.length == 0) {
            printUsage();
            return;
        }

        String mode = args[0].toLowerCase();

        try {
            switch (mode) {
                case "server":
                    runServer();
                    break;
                case "client":
                    runClient();
                    break;
                default:
                    System.err.println("Unknown mode: " + mode);
                    printUsage();
            }
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void runServer() throws IOException {
        System.out.println("Starting NIO Server...");
        System.out.println("This server demonstrates:");
        System.out.println("  - Selector for multiplexing I/O operations");
        System.out.println("  - ServerSocketChannel for accepting connections");
        System.out.println("  - Non-blocking I/O operations");
        System.out.println("  - Handling multiple clients with a single thread");
        System.out.println();

        NioServer server = new NioServer();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                server.stop();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }));

        server.start();
    }

    private static void runClient() {
        System.out.println("Starting NIO Client...");
        System.out.println("This client demonstrates:");
        System.out.println("  - SocketChannel for client connections");
        System.out.println("  - ByteBuffer for data transfer");
        System.out.println("  - Non-blocking channel operations");
        System.out.println();

        NioClient.main(new String[0]);
    }

    private static void printUsage() {
        System.out.println("Java NIO Selector and Channel Demo");
        System.out.println();
        System.out.println("Usage: java -jar java-nio-selector-demo.jar [mode]");
        System.out.println();
        System.out.println("Modes:");
        System.out.println("  server  - Run the NIO server");
        System.out.println("  client  - Run the NIO client");
        System.out.println();
        System.out.println("Examples:");
        System.out.println("  ./gradlew run --args='server'");
        System.out.println("  ./gradlew run --args='client'");
    }
}
