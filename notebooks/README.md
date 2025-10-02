# OWOX Data Marts - Notebooks

This folder contains Jupyter notebooks and utilities for data exploration, testing, and LinkedIn Ads configuration.

## Structure

```
notebooks/
├── README.md                    # This file
├── linkedin_ads_demo.ipynb     # Main LinkedIn Ads demo notebook
├── utils/
│   ├── api_client.py           # Simplified API client for notebooks
│   └── linkedin_config.py      # LinkedIn Ads configuration and fields
```

## Getting Started

### 1. Prerequisites

Make sure you have:
- Python 3.8+
- Jupyter Notebook or JupyterLab
- Required Python packages (install via `pip install -r requirements.txt`)

### 2. Install Dependencies

```bash
cd notebooks
pip install jupyter pandas requests
```

### 3. Start Jupyter

```bash
jupyter notebook
# or
jupyter lab
```

### 4. Open the Demo Notebook

Open `linkedin_ads_demo.ipynb` and follow the step-by-step guide.

## Files Overview

### `utils/api_client.py`

Simple API client for notebook usage with methods for:
- Authentication (login/register)
- Creating LinkedIn credentials
- Testing API connections
- Quick setup functions

### `utils/linkedin_config.py`

Complete LinkedIn Ads configuration including:
- **65+ Analytics Fields**: All available LinkedIn Ads metrics
- **Field Groups**: Predefined field combinations for common use cases
- **Campaign Types**: Sponsored content, messaging, text ads, etc.
- **Creative Types**: Single image, video, carousel, etc.
- **Helper Functions**: Field validation, request building

### `linkedin_ads_demo.ipynb`

Interactive notebook demonstrating:
- API authentication
- LinkedIn credentials setup
- Analytics field exploration
- Request payload building
- Data collection examples

## Field Groups Available

The configuration includes these predefined field groups:

- **`basic_performance`**: Essential metrics (impressions, clicks, cost, CTR)
- **`detailed_metrics`**: Extended performance data with conversions
- **`video_performance`**: Video-specific metrics and completion rates
- **`audience_insights`**: Demographic and targeting breakdowns  
- **`creative_analysis`**: Creative performance and engagement metrics

## Usage Examples

### Quick Setup
```python
from utils.api_client import quick_setup
from utils.linkedin_config import *

# Connect to API
client = quick_setup()

# Create LinkedIn credentials
client.create_linkedin_credentials(
    access_token="your_token",
    client_id="your_client_id", 
    client_secret="your_secret"
)
```

### Build Analytics Request
```python
# Get basic performance fields
fields = get_field_group("basic_performance")

# Build request payload
request = build_analytics_request(
    account_urns=["urn:li:sponsoredAccount:123456"],
    start_date="2024-01-01",
    end_date="2024-01-31",
    fields=fields
)
```

### Custom Field Selection
```python
# Validate custom fields
custom_fields = ["impressions", "clicks", "videoViews"]
valid, invalid = validate_fields(custom_fields)
print(f"Valid: {valid}, Invalid: {invalid}")
```

## LinkedIn API Credentials

To use the LinkedIn Ads API, you'll need:

1. **LinkedIn Developer Account**: Sign up at [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. **Create an App**: Register your application
3. **Get Credentials**: Obtain `client_id`, `client_secret`, and `access_token`
4. **Permissions**: Ensure your app has the required scopes:
   - `r_ads`
   - `r_ads_reporting` 
   - `rw_ads`

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Ensure the backend server is running (`docker-compose up`)
   - Check the API URL in the client configuration

2. **Authentication Errors** 
   - Verify your email/password are correct
   - Try registering a new user if needed

3. **LinkedIn API Errors**
   - Check your LinkedIn credentials are valid
   - Ensure your app has the required permissions
   - Verify account URNs are correct

### Getting Help

- Check the [FastAPI docs](http://localhost:8000/docs) for API reference
- Review the [LinkedIn Marketing API docs](https://docs.microsoft.com/en-us/linkedin/marketing/)
- Look at the notebook examples for usage patterns

## Next Steps

1. **Configure Your Credentials**: Update the demo notebook with your actual LinkedIn API credentials
2. **Explore Field Groups**: Try different field combinations for your use cases  
3. **Build Custom Requests**: Create analytics requests tailored to your needs
4. **Automate Collection**: Set up scheduled data collection workflows
5. **Analyze Data**: Use pandas/matplotlib to analyze collected LinkedIn data

## Contributing

When adding new notebooks or utilities:
- Follow the existing code style
- Include documentation and examples
- Test with the demo data first
- Update this README if adding new features
