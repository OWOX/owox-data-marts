'use client'

import { useState } from 'react'
import { authApi } from '@/lib/api'

export default function DebugAuthPage() {
  const [result, setResult] = useState('')

  const testLogin = async () => {
    setResult('Testing login...\n')
    
    try {
      const response = await authApi.login('test@example.com', 'password123')
      setResult(prev => prev + 'Login successful!\n' + JSON.stringify(response, null, 2))
    } catch (error: any) {
      setResult(prev => prev + 'Login failed: ' + error.message)
    }
  }

  const testRegister = async () => {
    setResult('Testing register...\n')
    
    try {
      const response = await authApi.register({
        email: 'newuser@example.com',
        username: 'newuser',
        password: 'password123',
        full_name: 'New User'
      })
      setResult(prev => prev + 'Register successful!\n' + JSON.stringify(response, null, 2))
    } catch (error: any) {
      setResult(prev => prev + 'Register failed: ' + error.message)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Auth Debug Page</h1>
      
      <div className="space-x-4 mb-6">
        <button 
          onClick={testLogin}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Test Login
        </button>
        
        <button 
          onClick={testRegister}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Test Register
        </button>
      </div>
      
      <pre className="bg-gray-100 p-4 rounded overflow-auto whitespace-pre-wrap">
        {result}
      </pre>
      
      <div className="mt-6 text-sm text-gray-600">
        <p>Check the browser console for detailed logs including URLs being called.</p>
      </div>
    </div>
  )
}
