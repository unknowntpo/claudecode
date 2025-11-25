#!/usr/bin/env python3
"""
Test script to validate blog_search_demo without database connections
"""

import sys

def test_imports():
    """Test that all required imports are available"""
    print("Testing imports...")
    try:
        import psycopg2
        print("✓ psycopg2 imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import psycopg2: {e}")
        return False

    try:
        from elasticsearch import Elasticsearch
        print("✓ elasticsearch imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import elasticsearch: {e}")
        return False

    try:
        from faker import Faker
        print("✓ faker imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import faker: {e}")
        return False

    try:
        from colorama import Fore, Style, init
        print("✓ colorama imported successfully")
    except ImportError as e:
        print(f"✗ Failed to import colorama: {e}")
        return False

    return True


def test_data_generation():
    """Test blog post generation without databases"""
    print("\nTesting data generation...")
    try:
        # Import the generate function
        import sys
        sys.path.insert(0, '.')
        from blog_search_demo import generate_blog_posts

        posts = generate_blog_posts(10)
        print(f"✓ Generated {len(posts)} blog posts")

        # Validate structure
        required_keys = ['title', 'author', 'content', 'tags', 'created_at']
        for i, post in enumerate(posts[:3]):
            for key in required_keys:
                if key not in post:
                    print(f"✗ Post {i} missing key: {key}")
                    return False

        print("✓ Blog post structure validated")
        return True
    except Exception as e:
        print(f"✗ Data generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("=" * 60)
    print("Blog Search Demo - Validation Tests")
    print("=" * 60)

    all_passed = True

    # Test imports
    if not test_imports():
        all_passed = False

    # Test data generation
    if not test_data_generation():
        all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("✓ All tests passed!")
        print("=" * 60)
        return 0
    else:
        print("✗ Some tests failed")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
