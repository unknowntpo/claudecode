#!/usr/bin/env python3
"""
Blog Post Index and Search Demo: PostgreSQL vs Elasticsearch

This script demonstrates the differences in indexing and searching blog posts
between PostgreSQL (relational database) and Elasticsearch (search engine).
"""

import time
import psycopg2
from psycopg2.extras import RealDictCursor
from elasticsearch import Elasticsearch
from faker import Faker
from colorama import Fore, Style, init
import random

# Initialize colorama for colored terminal output
init(autoreset=True)

# Configuration
POSTGRES_CONFIG = {
    'host': 'localhost',
    'port': 15432,
    'database': 'blogdb',
    'user': 'bloguser',
    'password': 'blogpass'
}

ELASTICSEARCH_CONFIG = {
    'hosts': ['http://localhost:19200']
}

ES_INDEX_NAME = 'blog_posts'

# Initialize Faker for generating sample data
fake = Faker()


class PostgresSearcher:
    """Handles blog post operations with PostgreSQL"""

    def __init__(self, config):
        self.conn = psycopg2.connect(**config)
        self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        self._create_table()

    def _create_table(self):
        """Create blog posts table with full-text search index"""
        self.cursor.execute("""
            DROP TABLE IF EXISTS blog_posts;
        """)
        self.cursor.execute("""
            CREATE TABLE blog_posts (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                author VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                tags TEXT[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                search_vector tsvector
            );
        """)
        # Create full-text search index
        self.cursor.execute("""
            CREATE INDEX blog_search_idx ON blog_posts
            USING GIN(search_vector);
        """)
        self.conn.commit()
        print(f"{Fore.GREEN}✓ PostgreSQL table created with full-text search index")

    def index_posts(self, posts):
        """Index blog posts into PostgreSQL"""
        start_time = time.time()

        for post in posts:
            self.cursor.execute("""
                INSERT INTO blog_posts (title, author, content, tags, search_vector)
                VALUES (%s, %s, %s, %s,
                    to_tsvector('english', %s || ' ' || %s || ' ' || %s))
            """, (
                post['title'],
                post['author'],
                post['content'],
                post['tags'],
                post['title'],
                post['author'],
                post['content']
            ))

        self.conn.commit()
        elapsed = time.time() - start_time
        print(f"{Fore.GREEN}✓ Indexed {len(posts)} posts in PostgreSQL in {elapsed:.3f}s")
        return elapsed

    def search(self, query):
        """Search blog posts using full-text search"""
        start_time = time.time()

        self.cursor.execute("""
            SELECT id, title, author,
                   ts_rank(search_vector, query) AS rank,
                   ts_headline('english', content, query,
                       'MaxWords=50, MinWords=25') AS snippet
            FROM blog_posts,
                 to_tsquery('english', %s) query
            WHERE search_vector @@ query
            ORDER BY rank DESC
            LIMIT 10;
        """, (query.replace(' ', ' & '),))

        results = self.cursor.fetchall()
        elapsed = time.time() - start_time

        return results, elapsed

    def close(self):
        """Close database connection"""
        self.cursor.close()
        self.conn.close()


class ElasticsearchSearcher:
    """Handles blog post operations with Elasticsearch"""

    def __init__(self, config):
        self.es = Elasticsearch(**config)
        self._create_index()

    def _create_index(self):
        """Create Elasticsearch index with mappings"""
        if self.es.indices.exists(index=ES_INDEX_NAME):
            self.es.indices.delete(index=ES_INDEX_NAME)

        mapping = {
            "mappings": {
                "properties": {
                    "title": {
                        "type": "text",
                        "analyzer": "english",
                        "fields": {
                            "keyword": {"type": "keyword"}
                        }
                    },
                    "author": {
                        "type": "text",
                        "fields": {
                            "keyword": {"type": "keyword"}
                        }
                    },
                    "content": {
                        "type": "text",
                        "analyzer": "english"
                    },
                    "tags": {
                        "type": "keyword"
                    },
                    "created_at": {
                        "type": "date"
                    }
                }
            },
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0
            }
        }

        self.es.indices.create(index=ES_INDEX_NAME, body=mapping)
        print(f"{Fore.CYAN}✓ Elasticsearch index created with custom mappings")

    def index_posts(self, posts):
        """Index blog posts into Elasticsearch"""
        start_time = time.time()

        for i, post in enumerate(posts):
            self.es.index(
                index=ES_INDEX_NAME,
                id=i + 1,
                document=post
            )

        # Refresh index to make documents searchable immediately
        self.es.indices.refresh(index=ES_INDEX_NAME)

        elapsed = time.time() - start_time
        print(f"{Fore.CYAN}✓ Indexed {len(posts)} posts in Elasticsearch in {elapsed:.3f}s")
        return elapsed

    def search(self, query):
        """Search blog posts using Elasticsearch"""
        start_time = time.time()

        search_query = {
            "query": {
                "multi_match": {
                    "query": query,
                    "fields": ["title^3", "author^2", "content"],
                    "type": "best_fields",
                    "fuzziness": "AUTO"
                }
            },
            "highlight": {
                "fields": {
                    "title": {},
                    "content": {
                        "fragment_size": 150,
                        "number_of_fragments": 1
                    }
                }
            },
            "size": 10
        }

        response = self.es.search(index=ES_INDEX_NAME, body=search_query)
        elapsed = time.time() - start_time

        results = []
        for hit in response['hits']['hits']:
            results.append({
                'id': hit['_id'],
                'score': hit['_score'],
                'title': hit['_source']['title'],
                'author': hit['_source']['author'],
                'highlight': hit.get('highlight', {})
            })

        return results, elapsed

    def close(self):
        """Close Elasticsearch connection"""
        self.es.close()


def generate_blog_posts(count=100):
    """Generate sample blog posts using Faker"""
    topics = [
        'python', 'javascript', 'database', 'elasticsearch', 'postgresql',
        'docker', 'kubernetes', 'microservices', 'machine learning', 'AI',
        'web development', 'cloud computing', 'devops', 'security', 'testing'
    ]

    posts = []
    for _ in range(count):
        topic = random.choice(topics)
        posts.append({
            'title': fake.sentence(nb_words=6).replace('.', ''),
            'author': fake.name(),
            'content': ' '.join([fake.paragraph(nb_sentences=10) for _ in range(3)]),
            'tags': random.sample(topics, k=random.randint(2, 5)),
            'created_at': fake.date_time_between(start_date='-1y', end_date='now').isoformat()
        })

    return posts


def print_header(text):
    """Print a styled header"""
    print(f"\n{Fore.YELLOW}{'='*80}")
    print(f"{Fore.YELLOW}{text:^80}")
    print(f"{Fore.YELLOW}{'='*80}\n")


def print_postgres_results(results, elapsed):
    """Print PostgreSQL search results"""
    print(f"{Fore.GREEN}PostgreSQL Results ({elapsed*1000:.2f}ms):")
    print(f"{Fore.GREEN}{'-'*80}")

    if not results:
        print(f"{Fore.RED}No results found")
        return

    for i, row in enumerate(results, 1):
        print(f"{Fore.WHITE}{i}. {Fore.CYAN}{row['title']}")
        print(f"   Author: {row['author']} | Relevance: {row['rank']:.4f}")
        print(f"   Snippet: {row['snippet'][:150]}...")
        print()


def print_elasticsearch_results(results, elapsed):
    """Print Elasticsearch search results"""
    print(f"{Fore.CYAN}Elasticsearch Results ({elapsed*1000:.2f}ms):")
    print(f"{Fore.CYAN}{'-'*80}")

    if not results:
        print(f"{Fore.RED}No results found")
        return

    for i, result in enumerate(results, 1):
        print(f"{Fore.WHITE}{i}. {Fore.CYAN}{result['title']}")
        print(f"   Author: {result['author']} | Score: {result['score']:.4f}")

        if 'content' in result['highlight']:
            print(f"   Highlight: {result['highlight']['content'][0][:150]}...")
        print()


def main():
    """Main demo function"""
    print_header("Blog Post Index & Search: PostgreSQL vs Elasticsearch")

    print(f"{Fore.WHITE}Initializing connections...")

    # Initialize searchers with error handling
    try:
        print(f"{Fore.WHITE}Connecting to PostgreSQL at {POSTGRES_CONFIG['host']}:{POSTGRES_CONFIG['port']}...")
        pg_searcher = PostgresSearcher(POSTGRES_CONFIG)
    except Exception as e:
        print(f"{Fore.RED}✗ Failed to connect to PostgreSQL: {e}")
        raise

    try:
        print(f"{Fore.WHITE}Connecting to Elasticsearch at {ELASTICSEARCH_CONFIG['hosts'][0]}...")
        es_searcher = ElasticsearchSearcher(ELASTICSEARCH_CONFIG)
    except Exception as e:
        print(f"{Fore.RED}✗ Failed to connect to Elasticsearch: {e}")
        pg_searcher.close()
        raise

    # Generate sample blog posts
    print(f"\n{Fore.WHITE}Generating 100 sample blog posts...")
    posts = generate_blog_posts(100)

    # Index posts in both systems
    print_header("INDEXING PERFORMANCE")
    pg_time = pg_searcher.index_posts(posts)
    es_time = es_searcher.index_posts(posts)

    print(f"\n{Fore.YELLOW}Indexing Speed Comparison:")
    print(f"  PostgreSQL: {pg_time:.3f}s")
    print(f"  Elasticsearch: {es_time:.3f}s")
    print(f"  Winner: {Fore.GREEN}{('PostgreSQL' if pg_time < es_time else 'Elasticsearch')}")

    # Test searches
    print_header("SEARCH DEMONSTRATIONS")

    search_queries = [
        "python programming",
        "machine learning AI",
        "docker kubernetes",
        "web development"
    ]

    for query in search_queries:
        print(f"\n{Fore.MAGENTA}{'─'*80}")
        print(f"{Fore.MAGENTA}Search Query: '{query}'")
        print(f"{Fore.MAGENTA}{'─'*80}\n")

        # PostgreSQL search
        pg_results, pg_elapsed = pg_searcher.search(query)
        print_postgres_results(pg_results, pg_elapsed)

        # Elasticsearch search
        es_results, es_elapsed = es_searcher.search(query)
        print_elasticsearch_results(es_results, es_elapsed)

        # Comparison
        print(f"{Fore.YELLOW}Search Speed: PostgreSQL={pg_elapsed*1000:.2f}ms, "
              f"Elasticsearch={es_elapsed*1000:.2f}ms")
        print(f"{Fore.YELLOW}Faster: {Fore.GREEN}"
              f"{('PostgreSQL' if pg_elapsed < es_elapsed else 'Elasticsearch')}")

    # Summary
    print_header("KEY DIFFERENCES")

    differences = [
        ("Setup Complexity", "Simple table with GIN index", "Index with custom mappings"),
        ("Query Language", "SQL with tsvector/tsquery", "JSON-based query DSL"),
        ("Relevance Scoring", "ts_rank function", "BM25 algorithm with boosting"),
        ("Fuzzy Matching", "Limited support", "Built-in with AUTO fuzziness"),
        ("Highlighting", "ts_headline function", "Rich highlighting with fragments"),
        ("Scalability", "Vertical scaling", "Horizontal scaling with shards"),
        ("Use Case", "Structured data + search", "Dedicated full-text search")
    ]

    print(f"{Fore.WHITE}{'Feature':<20} {'PostgreSQL':<30} {'Elasticsearch':<30}")
    print(f"{Fore.WHITE}{'-'*80}")
    for feature, pg_val, es_val in differences:
        print(f"{Fore.YELLOW}{feature:<20} {Fore.GREEN}{pg_val:<30} {Fore.CYAN}{es_val:<30}")

    # Cleanup
    print(f"\n{Fore.WHITE}Closing connections...")
    pg_searcher.close()
    es_searcher.close()

    print(f"\n{Fore.GREEN}✓ Demo completed successfully!\n")


if __name__ == "__main__":
    import sys
    try:
        main()
        sys.exit(0)
    except KeyboardInterrupt:
        print(f"\n{Fore.RED}Demo interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n{Fore.RED}Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
