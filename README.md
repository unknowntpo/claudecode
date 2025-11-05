# TSMC Stock Price Scraper

A Python web scraper to fetch real-time stock prices for TSMC (Taiwan Semiconductor Manufacturing Company) and other stocks by scraping Yahoo Finance using Playwright.

## Features

- Fetches real-time stock prices from Yahoo Finance
- No API key required!
- Displays comprehensive stock data:
  - Current price
  - Price change and percentage change
  - Open, high, low prices
  - Trading volume
  - Previous close
- Supports any stock ticker symbol on Yahoo Finance
- Includes demo mode with sample data

## Installation

1. Install Python 3.8 or higher

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

3. Install Playwright browsers:
```bash
playwright install chromium
```

## Usage

### Get TSMC stock price (default):
```bash
python tsmc_scraper.py
```

### Get any stock price by ticker symbol:
```bash
python tsmc_scraper.py AAPL
python tsmc_scraper.py NVDA
python tsmc_scraper.py GOOGL
python tsmc_scraper.py 2330.TW  # TSMC on Taiwan Stock Exchange
```

### Demo mode with sample data (instant, no internet needed):
```bash
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

- Python 3.8+
- playwright

## How It Works

This scraper uses Playwright to:
1. Launch a headless Chromium browser
2. Navigate to Yahoo Finance's quote page for the specified ticker
3. Extract stock data from the page
4. Parse and format the information

## Notes

- Data is sourced from Yahoo Finance
- No API key or registration required
- Scrapes real-time data directly from the website
- This scraper is for educational purposes only
- Please respect Yahoo Finance's terms of service
- The scraper may take a few seconds to run as it loads the page

## License

MIT
