# Connector Data Marts - Next.js Frontend

A modern Next.js frontend for the Connector Data Marts platform, providing an intuitive interface for managing platform credentials and data collection.

## Features

- **Next.js 14**: Modern React framework with App Router
- **TypeScript**: Full type safety throughout the application
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **React Query**: Powerful data fetching and caching
- **React Hook Form**: Performant forms with easy validation
- **Zustand**: Lightweight state management
- **Headless UI**: Unstyled, accessible UI components

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- FastAPI backend running on http://localhost:8000

### Installation

1. **Navigate to the frontend directory**:
   ```bash
   cd apps/nextjs-frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Protected dashboard pages
│   ├── login/            # Authentication pages
│   └── register/
├── components/            # Reusable UI components
│   └── dashboard/        # Dashboard-specific components
├── lib/                  # Utility libraries
│   ├── api/             # API client and services
│   ├── auth/            # Authentication context
│   └── platforms/       # Platform configurations
├── types/               # TypeScript type definitions
└── styles/             # Global styles
```

## Key Features

### Authentication
- JWT-based authentication
- Protected routes with automatic redirects
- User registration and login
- Profile management

### Platform Credentials Management
- Support for multiple marketing platforms:
  - Facebook Ads
  - LinkedIn Ads
  - TikTok Ads
  - Google Ads
- Secure credential storage
- Credential validation
- Easy credential management interface

### Data Collection
- Progressive data collection setup
- Real-time collection status tracking
- Collection history and logs
- Flexible scheduling options

### Dashboard
- Overview of all connected platforms
- Quick actions for common tasks
- Recent activity tracking
- Statistics and metrics

## Supported Platforms

The application supports connecting to various marketing platforms:

| Platform | Status | Features |
|----------|--------|----------|
| Facebook Ads | ✅ | Campaign data, ad performance, audience insights |
| LinkedIn Ads | ✅ | Campaign metrics, audience analytics |
| TikTok Ads | ✅ | Campaign performance, audience data |
| Google Ads | ✅ | Campaign data, keyword performance, conversions |

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler

### Code Style

The project uses:
- ESLint for code linting
- Prettier for code formatting
- TypeScript for type checking

### Adding New Platforms

To add support for a new platform:

1. **Add platform configuration** in `src/lib/platforms/index.ts`:
   ```typescript
   {
     name: 'new_platform',
     display_name: 'New Platform',
     description: 'Description of the platform',
     icon: '🆕',
     fields: [
       // Define required credential fields
     ]
   }
   ```

2. **Update backend** to handle the new platform's API integration

3. **Test the integration** with real credentials

### Component Guidelines

- Use TypeScript for all components
- Follow the established naming conventions
- Use Tailwind CSS classes for styling
- Implement proper error handling
- Add loading states for async operations

## API Integration

The frontend communicates with the FastAPI backend through:

- **Authentication**: JWT tokens for secure API access
- **REST API**: Standard HTTP methods for CRUD operations
- **Real-time Updates**: React Query for automatic data synchronization
- **Error Handling**: Comprehensive error handling with user feedback

## Security

- Credentials are never stored in localStorage
- JWT tokens are automatically managed
- API calls include proper authentication headers
- CORS is configured for secure cross-origin requests
- Input validation on all forms

## Deployment

### Production Build

```bash
npm run build
npm run start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Configuration

For production, set:
- `NEXT_PUBLIC_API_URL` to your production API URL
- Configure proper CORS settings in the backend
- Set up SSL/TLS certificates

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ELv2 License.
