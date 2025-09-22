'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { UserCircleIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'

export function DashboardHeader() {
  const { user, logout } = useAuth()

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="flex justify-between items-center px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Welcome back, {user?.full_name || user?.username}!</h2>
          <p className="text-sm text-gray-500">Manage your data connections and analytics</p>
        </div>
        
        <Menu as="div" className="relative">
          <Menu.Button className="flex items-center space-x-3 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
            <div className="flex items-center space-x-2">
              {user?.avatar_url ? (
                <img className="h-8 w-8 rounded-full" src={user.avatar_url} alt="" />
              ) : (
                <UserCircleIcon className="h-8 w-8 text-gray-400" />
              )}
              <span className="text-gray-700">{user?.username}</span>
            </div>
          </Menu.Button>
          
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={logout}
                    className={`${
                      active ? 'bg-gray-100' : ''
                    } flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                  >
                    <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                    Sign out
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>
    </header>
  )
}
