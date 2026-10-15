package ksgd;

/** Entry point: {@code run <appId> <processLabel> <threads>} or {@code inspect [port]}. */
public final class Main {
    static String bootstrap() {
        String b = System.getenv("BOOTSTRAP");
        return b == null || b.isBlank() ? "localhost:9092" : b;
    }

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "";
        switch (mode) {
            case "run" -> {
                if (args.length < 3) usage();
                int threads = args.length > 3 ? Integer.parseInt(args[3]) : 1;
                StreamsRunner.run(args[1], args[2], threads);
            }
            case "inspect" -> Inspector.run(args.length > 1 ? Integer.parseInt(args[1]) : 8085);
            default -> usage();
        }
    }

    private static void usage() {
        System.err.println("usage: streams-app run <appId> <processLabel> <threads> | inspect [port]");
        System.exit(2);
    }
}
