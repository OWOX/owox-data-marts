# Project Guidelines

This document is describing the project guidelines for the project.

## EnvironmentAdapter

### Overview

The `EnvironmentAdapter` class provides a unified interface for environment-specific operations across Google Apps Script and Node.js environments. It abstracts away platform differences and allows your code to work consistently in both environments.

### Motivation

- Use singe connectors source code in both environments: Node.js and Apps Script

### Key Features

- **Environment detection**: Automatically detects the runtime environment
- **Unified HTTP requests**: Consistent API for making HTTP requests
- **Response wrapping**: Unified response interface across platforms

### Table of Contents

1. [Key Features](#key-features)
2. [Getting Started](#getting-started)
3. [Essential EnvironmentAdapter Rules for Data Analysts](#essential-environmentadapter-rules-for-data-analysts)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [HTTP Requests](#http-requests)
7. [Utility Methods](#utility-methods)
8. [Error Handling](#error-handling)
9. [Troubleshooting](#troubleshooting)

### Key Features

- **Cross-platform compatibility**: Works in both Google Apps Script and Node.js
- **Unified HTTP requests**: Consistent API for making HTTP requests
- **Environment detection**: Automatic detection of runtime environment
- **Response wrapping**: Unified response interface across platforms
- **Utility functions**: Date formatting, UUID generation, encoding, and more

### Getting Started

#### Import and Setup

```javascript
// The EnvironmentAdapter is available as a global class
// No explicit import needed in Google Apps Script

// In Node.js, ensure it's available through your bundle system
```

#### Dependencies

Make sure the following constants and exceptions are available:

```javascript
// Required constants from CommonConstants.js
var ENVIRONMENT = {
  UNKNOWN: 1,
  APPS_SCRIPT: 2,
  NODE: 3,
};

// Required exception class from Exceptions.js
class UnsupportedEnvironmentException extends AbstractException {}
```

### Essential EnvironmentAdapter Rules for Data Analysts

#### What You Must Know

**EnvironmentAdapter** is a required class that makes your connector work in both Google Apps Script and Node.js environments. You MUST use it for all HTTP requests and environment-specific operations.

#### What NOT to Do

❌ Never use `fetch()` directly  
❌ Never use `UrlFetchApp` directly  
❌ Never use `Utilities` directly  
❌ Never skip error checking on API responses  
❌ Never make requests without proper headers  
❌ Never ignore rate limits  

#### Must Remember

1. **Always use EnvironmentAdapter.fetch()** for any HTTP request
2. **Always check response.getResponseCode()** before processing data
3. **Always handle errors** with try-catch blocks
4. **Always respect API rate limits** with sleep() between requests
5. **Always include proper headers** especially for authentication
6. **Always use EnvironmentAdapter utilities** for date formatting, UUID generation, encoding, and more

### Core Rules

#### 1. Always Use EnvironmentAdapter for HTTP Requests

```javascript
// ✅ CORRECT - Use this for all API calls
const response = EnvironmentAdapter.fetch("https://api.example.com/data");

// ❌ WRONG - Never use direct fetch()
const response = fetch("https://api.example.com/data");

// ❌ WRONG - Never use direct UrlFetchApp.fetch()
const response = UrlFetchApp.fetch("https://api.example.com/data");
```

#### 2. Standard Response Handling Pattern

```javascript
const response = EnvironmentAdapter.fetch(url, options);

// Check if request succeeded
if (response.getResponseCode() === 200) {
    const data = response.getAsJson();  // For JSON APIs
    // Process your data here
} else {
    // Handle error
    console.error("API request failed:", response.getResponseCode());
}
```

#### 3. Required Request Format for APIs

```javascript
const options = {
    method: "GET",  // or "POST", "PUT", etc.
    headers: {
        "Authorization": "Bearer your-token",
        "Content-Type": "application/json"
    }
};

// For POST requests with data
const postOptions = {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    payload: JSON.stringify({
        // your data here
    })
};
```

#### 4. Utility Functions

```javascript
// Generate unique IDs
const id = EnvironmentAdapter.getUuid();

// Wait between API calls (to avoid rate limits)
EnvironmentAdapter.sleep(1000); // Wait 1 second

// Encode data
const encoded = EnvironmentAdapter.base64Encode("your-data");
```

### API Reference

#### Static Methods

#### `getEnvironment()`

Returns the current runtime environment.

```javascript
static getEnvironment(): ENVIRONMENT
```

**Returns**: One of `ENVIRONMENT.APPS_SCRIPT`, `ENVIRONMENT.NODE`, or `ENVIRONMENT.UNKNOWN`

#### `fetch(url, options)`

Makes HTTP requests with unified response interface.

```javascript
static fetch(url: string, options: Object = {}): FetchResponse
```

**Parameters**:

- `url` (string): The URL to fetch data from
- `options` (Object): Request options (method, headers, payload, etc.)

**Returns**: `FetchResponse` object with unified methods

**Throws**: `UnsupportedEnvironmentException` if environment is not supported

#### `sleep(ms)`

Pauses execution for specified milliseconds.

```javascript
static sleep(ms: number): void
```

**Parameters**:

- `ms` (number): Milliseconds to sleep

**Throws**: `UnsupportedEnvironmentException` if environment is not supported

#### `formatDate(date, timezone, format)`

Formats a date according to environment capabilities.

```javascript
static formatDate(date: Date, timezone: string, format: string): string
```

**Parameters**:

- `date` (Date): Date to format
- `timezone` (string): Timezone for formatting
- `format` (string): Format pattern

**Returns**: Formatted date string

**Note**: In Node.js, only returns ISO date format regardless of parameters

#### `getUuid()`

Generates a UUID string.

```javascript
static getUuid(): string
```

**Returns**: UUID in format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

#### `base64Encode(data)`

Encodes data to base64.

```javascript
static base64Encode(data: string): string
```

**Parameters**:

- `data` (string): Data to encode

**Returns**: Base64 encoded string

#### `computeHmacSignature(algorithm, data, key)`

Computes HMAC signature.

```javascript
static computeHmacSignature(algorithm: string, data: string, key: string): string
```

**Parameters**:

- `algorithm` (string): HMAC algorithm (e.g., 'sha256', 'sha1')
- `data` (string): Data to sign
- `key` (string): Secret key

**Returns**: HMAC signature as hex string

### Usage Examples

#### Making HTTP Requests

##### GET Request

```javascript
try {
    const response = EnvironmentAdapter.fetch("https://api.example.com/data");
    
    // Check response status
    if (response.getResponseCode() === 200) {
        // Parse JSON response
        const data = response.getAsJson();
        console.log("Data received:", data);
        
        // Or get raw text
        const text = response.getContentText();
        console.log("Response text:", text);
    } else {
        console.error("Request failed with status:", response.getResponseCode());
    }
} catch (error) {
    console.error("Error making request:", error.message);
}
```

##### POST Request with JSON

```javascript
const requestOptions = {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer your-token-here"
    },
    payload: JSON.stringify({
        name: "John Doe",
        email: "john@example.com"
    })
};

try {
    const response = EnvironmentAdapter.fetch("https://api.example.com/users", requestOptions);
    const result = response.getAsJson();
    console.log("User created:", result);
} catch (error) {
    console.error("Error creating user:", error.message);
}
```

##### GET Request with Headers

```javascript
const options = {
    method: "GET",
    headers: {
        "User-Agent": "MyApp/1.0",
        "Accept": "application/json"
    }
};

const response = EnvironmentAdapter.fetch("https://api.example.com/profile", options);
const headers = response.getHeaders();
console.log("Response headers:", headers);
```

#### Utility Functions

##### Working with Dates

```javascript
const now = new Date();

// Format date (behavior differs by environment)
const formatted = EnvironmentAdapter.formatDate(now, "America/New_York", "yyyy-MM-dd");
console.log("Formatted date:", formatted);
```

##### Generating UUIDs

```javascript
const uniqueId = EnvironmentAdapter.getUuid();
console.log("Generated UUID:", uniqueId);
// Output: e.g., "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

##### Base64 Encoding

```javascript
const originalData = "Hello, World!";
const encoded = EnvironmentAdapter.base64Encode(originalData);
console.log("Encoded:", encoded);
// Output: "SGVsbG8sIFdvcmxkIQ=="
```

##### HMAC Signatures

```javascript
const message = "important data";
const secretKey = "my-secret-key";
const signature = EnvironmentAdapter.computeHmacSignature("sha256", message, secretKey);
console.log("HMAC signature:", signature);
```

##### Sleep/Delay

```javascript
console.log("Starting operation...");
EnvironmentAdapter.sleep(2000); // Wait 2 seconds
console.log("Operation completed after delay");
```

### HTTP Requests

#### FetchResponse Interface

All HTTP requests return a `FetchResponse` object with these methods:

```javascript
interface FetchResponse {
    getHeaders(): Object;           // Get response headers
    getAsJson(): any;              // Parse response as JSON
    getContent(): string|Buffer;   // Get raw content
    getContentText(): string;      // Get content as text
    getResponseCode(): number;     // Get HTTP status code
}
```

#### Request Options

The `options` parameter for `fetch()` supports:

```javascript
const options = {
    method: "GET|POST|PUT|DELETE|PATCH",
    headers: {
        "Header-Name": "Header-Value"
    },
    payload: "request body data",
    // Google Apps Script specific options
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true
};
```

#### Error Handling for HTTP Requests

```javascript
function safeApiCall(url, options) {
    try {
        const response = EnvironmentAdapter.fetch(url, options);
        
        const statusCode = response.getResponseCode();
        if (statusCode >= 400) {
            const errorText = response.getContentText();
            throw new Error(`HTTP ${statusCode}: ${errorText}`);
        }
        
        return response.getAsJson();
    } catch (error) {
        if (error.message.includes("Invalid JSON")) {
            console.error("Response is not valid JSON");
            return null;
        }
        throw error;
    }
}
```

### Utility Methods

#### Date Formatting Limitations

⚠️ **Important**: Date formatting behavior differs between environments:

- **Google Apps Script**: Full formatting support with timezone and format patterns
- **Node.js**: Always returns ISO date format (YYYY-MM-DD) regardless of parameters

```javascript
// Cross-platform date handling
function getFormattedDate(date) {
    if (EnvironmentAdapter.getEnvironment() === ENVIRONMENT.APPS_SCRIPT) {
        return EnvironmentAdapter.formatDate(date, "UTC", "yyyy-MM-dd");
    } else {
        // Node.js: implement custom formatting if needed
        return date.toISOString().split('T')[0];
    }
}
```

#### UUID Generation

UUIDs are generated using:

- **Google Apps Script**: Platform-specific UUID generation
- **Node.js**: `crypto.randomUUID()`

#### Encoding and Cryptography

Both platforms support:

- Base64 encoding
- HMAC signature computation with various algorithms (sha1, sha256, etc.)

### Error Handling

#### Common Exceptions

```javascript
try {
    const response = EnvironmentAdapter.fetch(url);
} catch (error) {
    if (error instanceof UnsupportedEnvironmentException) {
        console.error("Environment not supported:", error.message);
    } else {
        console.error("Other error:", error.message);
    }
}
```

#### Best Practices for Error Handling

```javascript
function robustApiCall(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = EnvironmentAdapter.fetch(url);
            if (response.getResponseCode() === 200) {
                return response.getAsJson();
            }
            throw new Error(`HTTP ${response.getResponseCode()}`);
        } catch (error) {
            console.warn(`Attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error;
            
            // Wait before retry
            EnvironmentAdapter.sleep(1000 * Math.pow(2, i)); // Exponential backoff
        }
    }
}
```

### Troubleshooting

#### Common Issues and Solutions

##### 1. UnsupportedEnvironmentException

**Problem**: Getting `UnsupportedEnvironmentException` error.

**Solution**:

- Ensure you're running in Google Apps Script or Node.js
- Check that required dependencies are installed in Node.js
- Verify `ENVIRONMENT` constants are properly defined

##### 2. JSON Parsing Errors

**Problem**: `response.getAsJson()` throws "Invalid JSON response" error.

**Solution**:

```javascript
const response = EnvironmentAdapter.fetch(url);
const text = response.getContentText();
console.log("Raw response:", text); // Debug the actual response

try {
    const json = response.getAsJson();
} catch (error) {
    console.error("Not a JSON response, got:", text);
}
```

##### 3. HTTP Request Timeouts

**Problem**: Requests hanging or timing out.

**Solution**:

```javascript
// For Google Apps Script, add timeout options
const options = {
    method: "GET",
    muteHttpExceptions: true,
    // Add other GAS-specific options as needed
};
```

##### 4. Missing Dependencies (Node.js)

**Problem**: `request` or `deasync` not found.

**Solution**:

```bash
npm install sync-request deasync
```

#### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
function debugFetch(url, options = {}) {
    console.log("Environment:", EnvironmentAdapter.getEnvironment());
    console.log("Request URL:", url);
    console.log("Request options:", options);
    
    try {
        const response = EnvironmentAdapter.fetch(url, options);
        console.log("Response code:", response.getResponseCode());
        console.log("Response headers:", response.getHeaders());
        
        return response;
    } catch (error) {
        console.error("Request failed:", error);
        throw error;
    }
}
```
