#!/usr/bin/env python3
"""
Minimal smallpond example - data processing with DuckDB
"""
import os
import pandas as pd
import smallpond

# Create sample data
print("Creating sample stock price data...")
data = {
    "ticker": ["AAPL", "AAPL", "AAPL", "GOOGL", "GOOGL", "GOOGL", "MSFT", "MSFT", "MSFT"],
    "date": ["2024-01-01", "2024-01-02", "2024-01-03"] * 3,
    "price": [150.0, 152.5, 151.0, 140.0, 142.0, 141.5, 380.0, 385.0, 382.0],
    "volume": [1000000, 1200000, 1100000, 800000, 900000, 850000, 500000, 600000, 550000],
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
