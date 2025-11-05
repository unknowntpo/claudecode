#!/usr/bin/env python3
"""
TSMC Stock Price Scraper
Fetches the current stock price for TSMC (Taiwan Semiconductor Manufacturing Company)
using Finnhub's free API.

To use this scraper, you need to:
1. Sign up for a free API key at https://finnhub.io/
2. Set your API key as an environment variable: export FINNHUB_API_KEY="your_key_here"
   Or pass it as a command-line argument
"""

import requests
import json
from datetime import datetime
import sys
import os


def get_tsmc_stock_price(ticker="TSM", api_key=None):
    """
    Get TSMC stock price from Finnhub API.

    Args:
        ticker (str): Stock ticker symbol. Default is "TSM" (NYSE).
        api_key (str): Finnhub API key. If not provided, will try to get from environment.

    Returns:
        dict: Dictionary containing stock information
    """
    # Get API key from parameter, environment variable, or use demo key
    if not api_key:
        api_key = os.environ.get('FINNHUB_API_KEY', 'demo')

    if api_key == 'demo':
        print("  NOTE: Using demo API key. Sign up at https://finnhub.io/ for a free key.")
        print("  Set it with: export FINNHUB_API_KEY='your_key'\n")

    try:
        # Get quote data
        quote_url = "https://finnhub.io/api/v1/quote"
        params = {
            'symbol': ticker,
            'token': api_key
        }

        response = requests.get(quote_url, params=params, timeout=10)
        response.raise_for_status()
        quote_data = response.json()

        # Check if we got valid data
        if 'c' not in quote_data or quote_data['c'] == 0:
            raise ValueError("No price data available. Check your API key or ticker symbol.")

        current_price = quote_data['c']  # Current price
        previous_close = quote_data['pc']  # Previous close
        open_price = quote_data['o']  # Open price
        high_price = quote_data['h']  # High price
        low_price = quote_data['l']  # Low price
        change = quote_data['d']  # Change
        change_percent = quote_data['dp']  # Percent change

        # Get company profile for additional info
        try:
            profile_url = "https://finnhub.io/api/v1/stock/profile2"
            profile_params = {
                'symbol': ticker,
                'token': api_key
            }
            profile_response = requests.get(profile_url, params=profile_params, timeout=10)
            profile_data = profile_response.json()

            company_name = profile_data.get('name', 'TSMC')
            exchange = profile_data.get('exchange', 'N/A')
            currency = profile_data.get('currency', 'USD')
        except:
            company_name = 'TSMC'
            exchange = 'N/A'
            currency = 'USD'

        return {
            'ticker': ticker,
            'company_name': company_name,
            'price': f"{current_price:.2f}",
            'change': f"{change:+.2f}",
            'change_percent': f"{change_percent:+.2f}%",
            'open': f"{open_price:.2f}",
            'high': f"{high_price:.2f}",
            'low': f"{low_price:.2f}",
            'volume': "N/A",  # Finnhub free tier doesn't include volume in quote
            'previous_close': f"{previous_close:.2f}",
            'currency': currency,
            'exchange': exchange,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'success': True
        }

    except requests.RequestException as e:
        return {
            'ticker': ticker,
            'error': f"Request failed: {str(e)}",
            'success': False
        }
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        return {
            'ticker': ticker,
            'error': f"Error parsing data: {str(e)}",
            'success': False
        }
    except Exception as e:
        return {
            'ticker': ticker,
            'error': f"Unexpected error: {str(e)}",
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
    api_key = None
    demo_mode = False

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == '--demo':
            demo_mode = True
        elif arg.startswith('--api-key='):
            api_key = arg.split('=')[1]
        elif not arg.startswith('--'):
            ticker = arg

    if demo_mode:
        print(f"Running in DEMO mode with sample data for ticker: {ticker}...")
        print("(Use without --demo flag for real data with API key)\n")
        stock_data = get_demo_data(ticker)
    else:
        print(f"Fetching TSMC stock price for ticker: {ticker}...")
        stock_data = get_tsmc_stock_price(ticker, api_key)

    print_stock_info(stock_data)

    return 0 if stock_data['success'] else 1


if __name__ == "__main__":
    sys.exit(main())
