import Link from 'next/link'
import { ArrowRightIcon, ChartBarIcon, CloudArrowUpIcon, CogIcon } from '@heroicons/react/24/outline'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">OWOX Data Marts</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-500 hover:text-gray-700">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            Self-Service
            <span className="text-primary-600"> Analytics Platform</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-xl text-gray-500">
            Create a data mart library and empower business users with spreadsheet reports and dashboards — in minutes.
          </p>
          <div className="mt-10 flex justify-center space-x-6">
            <Link href="/register" className="btn-primary text-lg px-8 py-3">
              Start Free Trial
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
            <Link href="/demo" className="btn-outline text-lg px-8 py-3">
              View Demo
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="flex justify-center">
                <CloudArrowUpIcon className="h-12 w-12 text-primary-600" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">Connect Any Platform</h3>
              <p className="mt-2 text-gray-600">
                Integrate with Facebook Ads, LinkedIn, TikTok, Google Ads, and more. Add your credentials securely and start collecting data.
              </p>
            </div>
            
            <div className="text-center">
              <div className="flex justify-center">
                <CogIcon className="h-12 w-12 text-primary-600" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">Automated Collection</h3>
              <p className="mt-2 text-gray-600">
                Set up scheduled data collection that runs automatically. Track your progress and manage multiple data sources effortlessly.
              </p>
            </div>
            
            <div className="text-center">
              <div className="flex justify-center">
                <ChartBarIcon className="h-12 w-12 text-primary-600" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">Instant Reports</h3>
              <p className="mt-2 text-gray-600">
                Generate reports and dashboards from your collected data. Export to Google Sheets, Excel, or your favorite BI tool.
              </p>
            </div>
          </div>
        </div>

        {/* Supported Platforms */}
        <div className="mt-24">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Supported Platforms
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { name: 'Facebook Ads', icon: '📘' },
              { name: 'LinkedIn Ads', icon: '💼' },
              { name: 'TikTok Ads', icon: '🎵' },
              { name: 'Google Ads', icon: '🔍' },
            ].map((platform) => (
              <div key={platform.name} className="text-center p-6 bg-white rounded-lg shadow-sm">
                <div className="text-4xl mb-3">{platform.icon}</div>
                <h3 className="font-semibold text-gray-900">{platform.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-500">
            <p>&copy; 2024 OWOX Data Marts. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
