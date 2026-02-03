#!/usr/bin/env python3
"""
Minimal smallpond example - data processing with DuckDB
Ray dashboard available at http://localhost:8265
"""
import os
import time
import numpy as np
import pandas as pd
import smallpond
import ray

# Create sample data - larger dataset for better observation
print("Creating sample stock price data...")
np.random.seed(42)
# Generate larger dataset for better Ray dashboard observation
tickers = ["AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "TSLA", "AMD"]
n_rows = 10000
data = {
    "ticker": np.random.choice(tickers, n_rows),
    "date": pd.date_range("2020-01-01", periods=n_rows // len(tickers), freq="h").tolist() * len(tickers),
    "price": np.random.uniform(100, 500, n_rows),
    "volume": np.random.randint(100000, 10000000, n_rows),
}

# Save sample data as parquet
os.makedirs("data", exist_ok=True)
df_pandas = pd.DataFrame(data)
df_pandas.to_parquet("data/prices.parquet", index=False)
print(f"Sample data saved to data/prices.parquet")
print(f"\nInput data:\n{df_pandas}\n")

# Initialize smallpond
print("Initializing smallpond...")
sp = smallpond.init()

# Read parquet file
df = sp.read_parquet("data/prices.parquet")

# Process data: get min/max prices per ticker
print("Processing: calculating min/max prices per ticker...")
df_result = sp.partial_sql(
    "SELECT ticker, MIN(price) as min_price, MAX(price) as max_price, SUM(volume) as total_volume FROM {0} GROUP BY ticker",
    df
)

# Write output
os.makedirs("output", exist_ok=True)
df_result.write_parquet("output/")

# Display results
print("\nResults:")
print(df_result.to_pandas())

print("\nSmallpond example completed successfully!")

# Keep Ray cluster alive for dashboard observation
print("\n" + "="*50)
print("Ray Dashboard: http://localhost:8265")
print("="*50)
print("\nKeeping Ray cluster alive for observation...")
print("Press Ctrl+C to stop\n")

try:
    while True:
        time.sleep(10)
        # Run periodic queries to show activity
        df = sp.read_parquet("data/prices.parquet")
        df_agg = sp.partial_sql(
            "SELECT ticker, AVG(price) as avg_price FROM {0} GROUP BY ticker",
            df
        )
        print(f"[{time.strftime('%H:%M:%S')}] Processed {n_rows} rows - Ray dashboard active")
except KeyboardInterrupt:
    print("\nShutting down...")
    ray.shutdown()
