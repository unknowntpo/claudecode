# TSMC Stock Price Scraper

A simple Python web scraper to fetch the current stock price of TSMC (Taiwan Semiconductor Manufacturing Company) using Finnhub's free API.

## Features

- Fetches real-time TSMC stock price
- Displays price change and percentage change
- Shows open, high, low prices
- Supports any US stock ticker symbol
- Free to use with Finnhub API key

## Installation

1. Install Python 3.6 or higher

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

3. Get a free API key:
   - Sign up at [https://finnhub.io/](https://finnhub.io/)
   - Get your free API key from the dashboard
   - Set it as an environment variable:
     ```bash
     export FINNHUB_API_KEY="your_api_key_here"
     ```

## Usage

### Get TSMC stock price from NYSE (default):
```bash
python tsmc_scraper.py
```

### Get any stock price by ticker symbol:
```bash
python tsmc_scraper.py AAPL
python tsmc_scraper.py NVDA
python tsmc_scraper.py TSM
```

### Specify API key via command line:
```bash
python tsmc_scraper.py TSM --api-key=your_api_key_here
```

### Demo mode with sample data (no API key needed):
```bash
# Run with sample data to see how it works
python tsmc_scraper.py --demo
python tsmc_scraper.py AAPL --demo
python tsmc_scraper.py NVDA --demo
```

## Example Output

```
Fetching TSMC stock price for ticker: TSM...

======================================================================
  Taiwan Semiconductor Manufacturing Company Limited
======================================================================
  Ticker:            TSM
  Current Price:     $145.23
  Change:            $+2.34
  Change Percent:    +1.64%
  Previous Close:    $142.89
  Open:              $143.50
  High:              $145.67
  Low:               $143.20
  Volume:            12,345,678
  Timestamp:         2025-11-05 10:30:45
======================================================================
```

## Requirements

- Python 3.6+
- requests

## Notes

- Data is sourced from Finnhub API
- Free API tier includes real-time US stock data
- Volume data not included in free tier
- This scraper is for educational purposes only
- API rate limits apply (see Finnhub documentation)

## License

MIT
