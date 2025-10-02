'use client'

import { useState } from 'react'
import { useQuery } from 'react-query'
import { ApiClient } from '@/lib/api'
import {
  CircleStackIcon,
  TableCellsIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeBracketIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface Destination {
  id: string
  name: string
  type: string
  description?: string
}

interface Table {
  name: string
  schema: string
  columns: Array<{
    name: string
    type: string
    nullable: boolean
  }>
  row_count?: number
}

interface TableData {
  data: any[]
  total: number
  offset: number
  limit: number
  columns: string[]
}

export default function DataBrowserPage() {
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [showQueryEditor, setShowQueryEditor] = useState(false)
  const [customQuery, setCustomQuery] = useState('SELECT * FROM ')
  const [queryResult, setQueryResult] = useState<any>(null)

  // Fetch destinations
  const { data: destinations = [], isLoading: loadingDestinations } = useQuery<Destination[]>(
    ['data-browser-destinations'],
    () => ApiClient.get('/data-browser/destinations')
  )

  // Fetch tables for selected destination
  const { data: tables = [], isLoading: loadingTables, refetch: refetchTables } = useQuery<Table[]>(
    ['data-browser-tables', selectedDestination],
    () => ApiClient.get(`/data-browser/destinations/${selectedDestination}/tables`),
    { enabled: !!selectedDestination }
  )

  // Fetch table data
  const { data: tableData, isLoading: loadingData, refetch: refetchData } = useQuery<TableData>(
    ['data-browser-data', selectedDestination, selectedTable, currentPage, pageSize],
    () => ApiClient.get(
      `/data-browser/destinations/${selectedDestination}/tables/${selectedTable}/data?offset=${currentPage * pageSize}&limit=${pageSize}`
    ),
    { enabled: !!selectedDestination && !!selectedTable }
  )

  const handleExecuteQuery = async () => {
    if (!selectedDestination) {
      toast.error('Please select a destination first')
      return
    }

    try {
      const result = await ApiClient.post(`/data-browser/destinations/${selectedDestination}/query`, {
        sql: customQuery
      })
      setQueryResult(result)
      toast.success('Query executed successfully')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Query execution failed')
    }
  }

  const totalPages = tableData ? Math.ceil(tableData.total / pageSize) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Browser</h1>
        <p className="text-gray-600">Explore data ingested into your destination databases</p>
      </div>

      {/* Destination Selector */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Select Destination Database
          </label>
          {selectedDestination && (
            <button
              onClick={() => setShowQueryEditor(!showQueryEditor)}
              className="btn-outline text-sm flex items-center"
            >
              <CodeBracketIcon className="h-4 w-4 mr-2" />
              {showQueryEditor ? 'Hide' : 'Show'} Query Editor
            </button>
          )}
        </div>
        
        {loadingDestinations ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((dest) => (
              <button
                key={dest.id}
                onClick={() => {
                  setSelectedDestination(dest.id)
                  setSelectedTable(null)
                  setCurrentPage(0)
                  setQueryResult(null)
                }}
                className={`p-4 border rounded-lg text-left transition-all ${
                  selectedDestination === dest.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <CircleStackIcon className={`h-6 w-6 ${
                    selectedDestination === dest.id ? 'text-primary-600' : 'text-gray-400'
                  }`} />
                  <div>
                    <h3 className="font-medium text-gray-900">{dest.name}</h3>
                    <p className="text-xs text-gray-500">{dest.type}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Query Editor */}
      {showQueryEditor && selectedDestination && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Custom SQL Query</h3>
          <textarea
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            className="w-full h-32 font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="SELECT * FROM table_name WHERE ..."
          />
          <div className="mt-4 flex justify-between items-center">
            <p className="text-xs text-gray-500">
              <strong>Note:</strong> Only SELECT queries are allowed for security
            </p>
            <button
              onClick={handleExecuteQuery}
              className="btn-primary flex items-center"
            >
              <MagnifyingGlassIcon className="h-4 w-4 mr-2" />
              Execute Query
            </button>
          </div>
        </div>
      )}

      {/* Query Results */}
      {queryResult && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Query Results ({queryResult.row_count} rows)
            </h3>
            <button
              onClick={() => setQueryResult(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {queryResult.columns.map((col: string) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {queryResult.data.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    {queryResult.columns.map((col: string) => (
                      <td key={col} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tables List and Data Viewer */}
      {selectedDestination && !showQueryEditor && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Tables List */}
          <div className="lg:col-span-1 bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Tables</h3>
              <button onClick={() => refetchTables()} className="text-primary-600 hover:text-primary-700">
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            </div>
            
            {loadingTables ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
              </div>
            ) : tables.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No tables found</p>
            ) : (
              <div className="space-y-2">
                {tables.map((table) => (
                  <button
                    key={table.name}
                    onClick={() => {
                      setSelectedTable(table.name)
                      setCurrentPage(0)
                    }}
                    className={`w-full p-3 rounded-md text-left transition-all ${
                      selectedTable === table.name
                        ? 'bg-primary-50 border border-primary-200'
                        : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <TableCellsIcon className={`h-4 w-4 ${
                        selectedTable === table.name ? 'text-primary-600' : 'text-gray-400'
                      }`} />
                      <span className="text-sm font-medium text-gray-900">{table.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{table.columns.length} columns</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table Data */}
          <div className="lg:col-span-3 bg-white shadow rounded-lg p-6">
            {selectedTable ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{selectedTable}</h3>
                    {tableData && (
                      <p className="text-sm text-gray-500">{tableData.total.toLocaleString()} total rows</p>
                    )}
                  </div>
                  <button onClick={() => refetchData()} className="btn-outline text-sm">
                    <ArrowPathIcon className="h-4 w-4 mr-2 inline" />
                    Refresh
                  </button>
                </div>

                {loadingData ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : tableData && tableData.data.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {tableData.columns.map((col) => (
                              <th
                                key={col}
                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {tableData.data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              {tableData.columns.map((col) => (
                                <td key={col} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                                  {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <label className="text-sm text-gray-700">Rows per page:</label>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value))
                            setCurrentPage(0)
                          }}
                          className="rounded-md border-gray-300 text-sm"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={250}>250</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-700">
                          Page {currentPage + 1} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                          disabled={currentPage === 0}
                          className="btn-outline text-sm disabled:opacity-50"
                        >
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                          disabled={currentPage >= totalPages - 1}
                          className="btn-outline text-sm disabled:opacity-50"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <TableCellsIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No data</h3>
                    <p className="mt-1 text-sm text-gray-500">This table appears to be empty</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <TableCellsIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Select a table</h3>
                <p className="mt-1 text-sm text-gray-500">Choose a table from the list to view its data</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!selectedDestination && (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <CircleStackIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No destination selected</h3>
          <p className="mt-1 text-sm text-gray-500">
            Select a destination database above to browse its tables and data
          </p>
        </div>
      )}
    </div>
  )
}
