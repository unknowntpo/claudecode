FROM python:3.11-slim

WORKDIR /app

# Install smallpond (includes ray, duckdb, pandas, numpy)
RUN pip install --no-cache-dir smallpond

# Copy example scripts
COPY . .

# Expose Ray dashboard port
EXPOSE 8265

CMD ["python", "-u", "example.py"]
