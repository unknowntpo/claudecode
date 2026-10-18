package ksgd;

import java.util.Properties;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

/**
 * {@code seed} mode (Spec 006 Behavior 6, the optional {@code seed} compose service): writes SEED_WORDS distinct
 * words to text-lines once, ten per line, so word-count's counts-store and its changelog are large enough for a
 * restore to be visible. Exits when every record is acknowledged.
 */
final class Seed {
    static void run() {
        String env = System.getenv("SEED_WORDS");
        long words = env == null || env.isBlank() ? 2_000_000 : Long.parseLong(env.trim());
        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, Main.bootstrap());
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        p.put(ProducerConfig.LINGER_MS_CONFIG, 50);
        p.put(ProducerConfig.BATCH_SIZE_CONFIG, 256 * 1024);
        p.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");
        try (KafkaProducer<String, String> producer = new KafkaProducer<>(p)) {
            StringBuilder line = new StringBuilder();
            for (long i = 0; i < words; i++) {
                if (line.length() > 0) line.append(' ');
                line.append("seed-").append(i);
                if (i % 10 == 9 || i == words - 1) {
                    producer.send(new ProducerRecord<>("text-lines", null, line.toString()));
                    line.setLength(0);
                }
                if (i % 500_000 == 499_999) System.out.println("seeded " + (i + 1) + " words");
            }
            producer.flush();
        }
        System.out.println("seeded " + words + " distinct words to text-lines");
    }
}
