package ksgd;

import java.util.List;
import java.util.Properties;
import java.util.Random;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

/**
 * Spec 002 Behavior 1: one background loop writing demo records — text-lines 5/s, page-views 5/s,
 * orders 3/s, customers 1/s. Errors go to stderr and never stop the loop.
 */
final class DemoProducer {
    private static final List<String> WORDS = List.of(
            "kafka", "streams", "group", "task", "topic", "partition", "record", "offset",
            "broker", "lag", "flow", "state", "store", "commit", "assign", "member");
    private static final long TICK_MS = 100; // 10 ticks per second

    private final KafkaProducer<String, String> producer;
    private final Random random = new Random();
    private long tick;

    private DemoProducer(KafkaProducer<String, String> producer) {
        this.producer = producer;
    }

    static void start() {
        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Main.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.LINGER_MS_CONFIG, 20);
        // a broker outage must not block the loop for the default 60 s
        p.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 2000);
        p.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 5000);
        p.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 2000);
        DemoProducer d = new DemoProducer(new KafkaProducer<>(p));
        ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "demo-producer");
            t.setDaemon(true);
            return t;
        });
        exec.scheduleAtFixedRate(d::step, 0, TICK_MS, TimeUnit.MILLISECONDS);
    }

    private void step() {
        try {
            long n = tick++;
            int slot = (int) (n % 10);
            if (slot % 2 == 0) send("text-lines", null, sentence());                   // 5/s
            else send("page-views", "user-" + random.nextInt(20), "/page/" + random.nextInt(10)); // 5/s
            if (slot == 0 || slot == 3 || slot == 6)                                      // 3/s
                send("orders", "cust-" + random.nextInt(10), "order-" + n);
            if (slot == 5) {                                                              // 1/s
                int c = random.nextInt(10);
                send("customers", "cust-" + c, "customer-" + c);
            }
        } catch (Throwable t) {
            // never let an exception cancel the scheduled task
            System.err.println("demo-producer: " + t);
        }
    }

    private void send(String topic, String key, String value) {
        try {
            producer.send(new ProducerRecord<>(topic, key, value), (md, e) -> {
                if (e != null) System.err.println("demo-producer: send to " + topic + " failed: " + e);
            });
        } catch (Exception e) {
            System.err.println("demo-producer: send to " + topic + " failed: " + e);
        }
    }

    private String sentence() {
        int len = 3 + random.nextInt(8); // 3..10 words, ≈ 6.5 on average
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            if (i > 0) sb.append(' ');
            sb.append(WORDS.get(random.nextInt(WORDS.size())));
        }
        return sb.toString();
    }
}
