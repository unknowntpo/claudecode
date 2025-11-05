#!/usr/bin/env python3
"""
TSMC Stock Price Scraper
Fetches the current stock price for TSMC (Taiwan Semiconductor Manufacturing Company)
by scraping Yahoo Finance using Playwright.

No API key required!
"""

from playwright.sync_api import sync_playwright
from datetime import datetime
import sys
import re


def get_tsmc_stock_price(ticker="TSM"):
    """
    Scrape TSMC stock price from Yahoo Finance using Playwright.

    Args:
        ticker (str): Stock ticker symbol. Default is "TSM" (NYSE).
                     Can also use "2330.TW" for Taiwan Stock Exchange.

    Returns:
        dict: Dictionary containing stock information
    """
    try:
        with sync_playwright() as p:
            # Launch browser in headless mode
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Navigate to Yahoo Finance
            url = f"https://finance.yahoo.com/quote/{ticker}"
            page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Wait for the price element to be visible
            page.wait_for_selector('[data-field="regularMarketPrice"]', timeout=10000)

            # Extract company name
            try:
                company_name = page.locator('h1').first.inner_text()
                # Clean up the name (remove ticker in parentheses)
                company_name = re.sub(r'\s*\([^)]*\)\s*$', '', company_name)
            except:
                company_name = ticker

            # Extract current price
            price_element = page.locator('[data-field="regularMarketPrice"]').first
            current_price = float(price_element.get_attribute('value'))

            # Extract change and change percent
            try:
                change_element = page.locator('[data-field="regularMarketChange"]').first
                change = float(change_element.get_attribute('value'))
            except:
                change = 0.0

            try:
                change_percent_element = page.locator('[data-field="regularMarketChangePercent"]').first
                change_percent = float(change_percent_element.get_attribute('value'))
            except:
                change_percent = 0.0

            # Extract additional data from the summary table
            try:
                # Previous Close
                prev_close_text = page.locator('text=Previous Close').locator('..').locator('td').nth(1).inner_text()
                previous_close = float(prev_close_text.replace(',', ''))
            except:
                previous_close = current_price - change

            try:
                # Open
                open_text = page.locator('text=Open').locator('..').locator('td').nth(1).inner_text()
                open_price = float(open_text.replace(',', ''))
            except:
                open_price = None

            try:
                # Day's Range (contains high and low)
                range_text = page.locator('text="Day\'s Range"').locator('..').locator('td').nth(1).inner_text()
                low_str, high_str = range_text.split(' - ')
                low_price = float(low_str.replace(',', ''))
                high_price = float(high_str.replace(',', ''))
            except:
                low_price = None
                high_price = None

            try:
                # Volume
                volume_text = page.locator('text=Volume').locator('..').locator('td').nth(1).inner_text()
                volume = volume_text
            except:
                volume = "N/A"

            browser.close()

            return {
                'ticker': ticker,
                'company_name': company_name,
                'price': f"{current_price:.2f}",
                'change': f"{change:+.2f}",
                'change_percent': f"{change_percent:+.2f}%",
                'open': f"{open_price:.2f}" if open_price else "N/A",
                'high': f"{high_price:.2f}" if high_price else "N/A",
                'low': f"{low_price:.2f}" if low_price else "N/A",
                'volume': volume,
                'previous_close': f"{previous_close:.2f}",
                'currency': "USD",
                'exchange': "Yahoo Finance",
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'success': True
            }

    except Exception as e:
        return {
            'ticker': ticker,
            'error': f"Error scraping data: {str(e)}",
            'success': False
        }


def print_stock_info(stock_data):
    """Print stock information in a formatted way."""
    if stock_data['success']:
        currency = stock_data.get('currency', 'USD')
        currency_symbol = '$' if currency == 'USD' else currency + ' '

        print(f"\n{'='*70}")
        print(f"  {stock_data.get('company_name', 'TSMC')}")
        print(f"{'='*70}")
        print(f"  Ticker:            {stock_data['ticker']}")
        print(f"  Exchange:          {stock_data.get('exchange', 'N/A')}")
        print(f"  Current Price:     {currency_symbol}{stock_data['price']}")
        print(f"  Change:            {currency_symbol}{stock_data['change']}")
        print(f"  Change Percent:    {stock_data['change_percent']}")
        print(f"  Previous Close:    {currency_symbol}{stock_data.get('previous_close', 'N/A')}")
        print(f"  Open:              {currency_symbol}{stock_data.get('open', 'N/A')}")
        print(f"  High:              {currency_symbol}{stock_data.get('high', 'N/A')}")
        print(f"  Low:               {currency_symbol}{stock_data.get('low', 'N/A')}")
        print(f"  Volume:            {stock_data.get('volume', 'N/A')}")
        print(f"  Timestamp:         {stock_data['timestamp']}")
        print(f"{'='*70}\n")
    else:
        print(f"\n{'='*70}")
        print(f"  Error fetching stock data")
        print(f"{'='*70}")
        print(f"  Ticker: {stock_data['ticker']}")
        print(f"  Error:  {stock_data['error']}")
        print(f"{'='*70}\n")


def get_demo_data(ticker="TSM"):
    """Return sample data for demo mode."""
    demo_prices = {
        "TSM": {"name": "Taiwan Semiconductor Manufacturing Company Limited", "price": 189.45, "prev": 187.23},
        "AAPL": {"name": "Apple Inc.", "price": 175.43, "prev": 174.50},
        "NVDA": {"name": "NVIDIA Corporation", "price": 875.28, "prev": 870.12},
    }

    stock = demo_prices.get(ticker, {"name": "Sample Company", "price": 100.00, "prev": 98.50})
    change = stock["price"] - stock["prev"]
    change_percent = (change / stock["prev"]) * 100

    return {
        'ticker': ticker,
        'company_name': stock["name"],
        'price': f"{stock['price']:.2f}",
        'change': f"{change:+.2f}",
        'change_percent': f"{change_percent:+.2f}%",
        'open': f"{stock['prev'] + 0.5:.2f}",
        'high': f"{stock['price'] + 1.2:.2f}",
        'low': f"{stock['prev'] - 0.8:.2f}",
        'volume': "12,345,678",
        'previous_close': f"{stock['prev']:.2f}",
        'currency': "USD",
        'exchange': "NASDAQ" if ticker != "TSM" else "NYSE",
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'success': True
    }


def main():
    """Main function to run the scraper."""
    # Parse command line arguments
    ticker = "TSM"
    demo_mode = False

    for arg in sys.argv[1:]:
        if arg == '--demo':
            demo_mode = True
        elif not arg.startswith('--'):
            ticker = arg

    if demo_mode:
        print(f"Running in DEMO mode with sample data for ticker: {ticker}...")
        print("(Use without --demo flag for real data from Yahoo Finance)\n")
        stock_data = get_demo_data(ticker)
    else:
        print(f"Fetching stock price for {ticker} from Yahoo Finance...")
        print("This may take a few seconds...\n")
        stock_data = get_tsmc_stock_price(ticker)

    print_stock_info(stock_data)

    return 0 if stock_data['success'] else 1


if __name__ == "__main__":
    sys.exit(main())
