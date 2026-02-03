FROM python:3.11-slim

WORKDIR /app

# Install smallpond
RUN pip install --no-cache-dir smallpond

# Copy example scripts
COPY . .

CMD ["python", "example.py"]
