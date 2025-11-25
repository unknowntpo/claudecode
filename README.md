# Blog Post Search Demo: PostgreSQL vs Elasticsearch

A comprehensive demonstration comparing full-text search capabilities between PostgreSQL and Elasticsearch for blog post indexing and searching.

## Architecture

This project demonstrates the differences in:
- **Indexing Performance**: How fast each system can index 100 blog posts
- **Search Speed**: Query execution time comparison
- **Query Capabilities**: Full-text search, relevance scoring, and highlighting
- **Setup Complexity**: Configuration and schema design

## Services

### PostgreSQL (Port 15432)
- Database: `blogdb`
- User: `bloguser`
- Password: `blogpass`
- Features: Full-text search with GIN index, ts_vector, ts_query

### Elasticsearch (Port 19200)
- HTTP API: `http://localhost:19200`
- Transport: Port 19300
- Features: Full-text search with BM25 scoring, fuzzy matching, highlighting

### Kibana (Port 15601)
- Web UI: `http://localhost:15601`
- Use for visualizing Elasticsearch data and running queries

## Prerequisites

- Docker and Docker Compose
- Python 3.8+
- pip (Python package manager)

## Setup Instructions

### 1. Start the Services

```bash
# Start all services (PostgreSQL, Elasticsearch, Kibana)
docker-compose up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f
```

Wait for all services to be healthy (may take 1-2 minutes for Elasticsearch).

### 2. Install Python Dependencies

```bash
# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Run the Demo

```bash
# Make the script executable
chmod +x blog_search_demo.py

# Run the demo
python blog_search_demo.py
```

## What the Demo Does

1. **Generates Sample Data**: Creates 100 blog posts with realistic content using Faker
2. **Indexes Data**: Loads posts into both PostgreSQL and Elasticsearch
3. **Compares Indexing Speed**: Measures how long each system takes to index
4. **Executes Search Queries**: Runs multiple search queries on both systems
5. **Compares Results**: Shows relevance ranking, snippets, and search speed
6. **Displays Differences**: Summarizes key architectural differences

## Example Output

```
================================================================================
                Blog Post Index & Search: PostgreSQL vs Elasticsearch
================================================================================

Initializing connections...

Generating 100 sample blog posts...

================================================================================
                           INDEXING PERFORMANCE
================================================================================

✓ PostgreSQL table created with full-text search index
✓ Indexed 100 posts in PostgreSQL in 0.234s
✓ Elasticsearch index created with custom mappings
✓ Indexed 100 posts in Elasticsearch in 0.156s

Indexing Speed Comparison:
  PostgreSQL: 0.234s
  Elasticsearch: 0.156s
  Winner: Elasticsearch
```

## Kibana Access

Access Kibana at `http://localhost:15601` to:
- View indexed documents
- Create visualizations
- Run custom Elasticsearch queries
- Monitor cluster health

### Useful Kibana Features

1. **Dev Tools Console**: Run Elasticsearch queries
   ```json
   GET /blog_posts/_search
   {
     "query": {
       "match": {
         "content": "python"
       }
     }
   }
   ```

2. **Discover**: Browse indexed blog posts
3. **Index Management**: View index settings and mappings

## Key Differences Demonstrated

| Feature | PostgreSQL | Elasticsearch |
|---------|-----------|---------------|
| **Setup** | Simple table + GIN index | Index with custom mappings |
| **Query Language** | SQL (tsvector/tsquery) | JSON Query DSL |
| **Relevance Scoring** | ts_rank() function | BM25 algorithm with field boosting |
| **Fuzzy Matching** | Limited trigram support | Built-in AUTO fuzziness |
| **Highlighting** | ts_headline() function | Rich highlighting with fragments |
| **Scalability** | Vertical (bigger server) | Horizontal (more nodes) |
| **Best For** | Structured data + search | Dedicated full-text search |

## PostgreSQL Search Features

- **Full-text indexing** with GIN (Generalized Inverted Index)
- **tsvector**: Normalized document representation
- **tsquery**: Search query parsing
- **ts_rank**: Relevance scoring based on term frequency
- **ts_headline**: Context-aware snippet generation

## Elasticsearch Search Features

- **Inverted index**: Optimized for fast lookups
- **BM25 scoring**: Advanced relevance algorithm
- **Field boosting**: Give more weight to title/author matches
- **Fuzzy matching**: Handle typos automatically
- **Rich highlighting**: Show matching fragments with context
- **Aggregations**: Group and analyze results

## Stopping the Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (deletes all data)
docker-compose down -v
```

## Troubleshooting

### Services not starting
```bash
# Check logs for specific service
docker-compose logs postgres
docker-compose logs elasticsearch
docker-compose logs kibana
```

### Connection refused errors
- Ensure Docker services are running: `docker-compose ps`
- Wait for health checks to pass (check with `docker-compose ps`)
- Verify ports are not in use: `netstat -an | grep 15432`

### Elasticsearch memory errors
If Elasticsearch fails to start due to memory issues, reduce heap size in `docker-compose.yml`:
```yaml
ES_JAVA_OPTS: "-Xms256m -Xmx256m"
```

## Performance Tips

- **PostgreSQL**: Increase `work_mem` for better sorting performance
- **Elasticsearch**: Adjust `number_of_shards` based on data volume
- **Both**: Use connection pooling for production workloads

## License

MIT License - feel free to use for learning and demonstration purposes.
