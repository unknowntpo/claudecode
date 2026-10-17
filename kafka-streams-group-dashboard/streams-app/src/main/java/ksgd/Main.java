package ksgd;

import java.net.InetAddress;
import java.util.Hashtable;
import javax.naming.directory.Attribute;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;

/**
 * Entry point, one jar for every demo service (Spec 004 Behavior 1); the first argument picks the mode:
 * {@code run <appId> [label] [threads]}, {@code produce}, {@code setup} or {@code inspect [port]}.
 */
public final class Main {
    static String bootstrap() {
        String b = System.getenv("BOOTSTRAP");
        return b == null || b.isBlank() ? "localhost:9092" : b;
    }

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "";
        switch (mode) {
            case "run" -> {
                if (args.length < 2) usage();
                String label = args.length > 2 ? args[2] : defaultLabel();
                // the thread count is the app's own config: an argument, else STREAM_THREADS, else 1
                String envThreads = System.getenv("STREAM_THREADS");
                int threads = args.length > 3 ? Integer.parseInt(args[3])
                        : envThreads != null && !envThreads.isBlank() ? Integer.parseInt(envThreads.trim()) : 1;
                StreamsRunner.run(args[1], label, threads);
            }
            case "produce" -> DemoProducer.run();
            case "setup" -> Setup.run();
            case "inspect" -> Inspector.run(args.length > 1 ? Integer.parseInt(args[1]) : 8085);
            default -> usage();
        }
    }

    /**
     * The process label when none is given: the container name, so {@code client.id = <appId>-<container>}.
     * Docker sets HOSTNAME (and /etc/hosts) to the container id, not its name; the embedded DNS answers a PTR
     * query for the container's own address with {@code <container-name>.<network>}, so the label is the first
     * part of that answer. Outside Docker (no such answer) it falls back to HOSTNAME, then the local host name.
     */
    static String defaultLabel() {
        String host = System.getenv("HOSTNAME");
        try {
            InetAddress self = InetAddress.getLocalHost();
            String ptr = self.isLoopbackAddress() ? null : reverseDns(self.getAddress());
            String first = ptr == null ? "" : ptr.split("\\.")[0];
            if (!first.isEmpty() && !first.equals("localhost")) return first;
            return host != null && !host.isBlank() ? host : self.getHostName();
        } catch (Exception e) {
            return host != null && !host.isBlank() ? host : "local";
        }
    }

    /** PTR lookup through the system resolver (JNDI DNS, bypassing /etc/hosts); null when there is no answer. */
    private static String reverseDns(byte[] ip) {
        if (ip.length != 4) return null;
        String name = (ip[3] & 0xff) + "." + (ip[2] & 0xff) + "." + (ip[1] & 0xff) + "." + (ip[0] & 0xff) + ".in-addr.arpa";
        Hashtable<String, String> env = new Hashtable<>();
        env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
        env.put("java.naming.provider.url", "dns:");
        env.put("com.sun.jndi.dns.timeout.initial", "500");
        env.put("com.sun.jndi.dns.timeout.retries", "1");
        try {
            DirContext ctx = new InitialDirContext(env);
            try {
                Attribute ptr = ctx.getAttributes(name, new String[] {"PTR"}).get("PTR");
                return ptr == null || ptr.size() == 0 ? null : ptr.get(0).toString();
            } finally {
                ctx.close();
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static void usage() {
        System.err.println("usage: streams-app run <appId> [label] [threads] | produce | setup | inspect [port]");
        System.exit(2);
    }
}
