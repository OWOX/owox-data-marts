"""
API Client for OWOX Data Marts Notebooks
Simplified client for testing and data exploration
"""
import requests
import json
from typing import Dict, Any, Optional
from datetime import datetime


class NotebookAPIClient:
    """Simple API client for notebook usage"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
    
    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login and store token"""
        url = f"{self.base_url}/api/v1/auth/login"
        data = {
            'username': email,
            'password': password
        }
        
        response = self.session.post(url, data=data)
        response.raise_for_status()
        
        result = response.json()
        self.token = result['access_token']
        
        # Set authorization header for future requests
        self.session.headers.update({
            'Authorization': f'Bearer {self.token}'
        })
        
        print(f"✅ Logged in successfully! Token expires in {result.get('expires_in', 'unknown')} seconds")
        return result
    
    def register(self, email: str, username: str, password: str, full_name: str = None) -> Dict[str, Any]:
        """Register new user"""
        url = f"{self.base_url}/api/v1/auth/register"
        data = {
            'email': email,
            'username': username,
            'password': password,
            'full_name': full_name or f"{username} User"
        }
        
        response = self.session.post(url, json=data)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ User registered successfully: {result.get('username')} ({result.get('email')})")
        return result
    
    def create_linkedin_credentials(self, 
                                  access_token: str, 
                                  client_id: str, 
                                  client_secret: str,
                                  account_name: str = "LinkedIn Account") -> Dict[str, Any]:
        """Create LinkedIn platform credentials"""
        url = f"{self.base_url}/api/v1/platforms/linkedin/credentials"
        data = {
            'platform_name': 'linkedin',
            'platform_display_name': 'LinkedIn Account',
            'credentials': {
                'access_token': access_token,
                'client_id': client_id,
                'client_secret': client_secret
            },
            'account_name': account_name
        }
        
        response = self.session.post(url, json=data)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ LinkedIn credentials created with ID: {result.get('id')}")
        return result
    
    def get_platform_credentials(self) -> Dict[str, Any]:
        """Get all platform credentials"""
        url = f"{self.base_url}/api/v1/platform-credentials"
        
        response = self.session.get(url)
        response.raise_for_status()
        
        return response.json()
    
    def test_connection(self):
        """Test API connection"""
        url = f"{self.base_url}/health"
        
        try:
            response = self.session.get(url)
            response.raise_for_status()
            print("✅ API connection successful!")
            return True
        except Exception as e:
            print(f"❌ API connection failed: {e}")
            return False


# Convenience function for quick setup
def quick_setup(email: str = "demo@example.com", password: str = "demopassword123") -> NotebookAPIClient:
    """Quick setup for notebook usage"""
    client = NotebookAPIClient()
    
    print("🔌 Testing connection...")
    if not client.test_connection():
        return None
    
    print("🔐 Logging in...")
    try:
        client.login(email, password)
        return client
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print("❌ Login failed. User might not exist.")
            return None
        raise
