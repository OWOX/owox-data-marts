'use client'

import { useState } from 'react'
import { 
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon as CheckCircle,
  XMarkIcon as X
} from '@heroicons/react/24/outline'
import { LINKEDIN_FIELD_CATEGORIES, LinkedInFieldCategory } from '@/types/collections'

interface Props {
  selectedFields: string[]
  onFieldsChange: (fields: string[]) => void
}

export function LinkedInFieldSelector({ selectedFields, onFieldsChange }: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Essential']) // Essential category expanded by default
  )
  const [searchQuery, setSearchQuery] = useState('')

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName)
    } else {
      newExpanded.add(categoryName)
    }
    setExpandedCategories(newExpanded)
  }

  const handleFieldToggle = (field: string) => {
    const isSelected = selectedFields.includes(field)
    if (isSelected) {
      onFieldsChange(selectedFields.filter(f => f !== field))
    } else {
      onFieldsChange([...selectedFields, field])
    }
  }

  const selectCategoryFields = (category: LinkedInFieldCategory) => {
    const categoryFields = category.fields.filter(field => !selectedFields.includes(field))
    onFieldsChange([...selectedFields, ...categoryFields])
  }

  const deselectCategoryFields = (category: LinkedInFieldCategory) => {
    onFieldsChange(selectedFields.filter(field => !category.fields.includes(field)))
  }

  const getCategorySelectedCount = (category: LinkedInFieldCategory) => {
    return category.fields.filter(field => selectedFields.includes(field)).length
  }

  const getColorClasses = (color: string, selected: boolean = false) => {
    const colors = {
      blue: selected ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-blue-50 text-blue-700 border-blue-100',
      green: selected ? 'bg-green-100 text-green-800 border-green-200' : 'bg-green-50 text-green-700 border-green-100',
      purple: selected ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-purple-50 text-purple-700 border-purple-100',
      pink: selected ? 'bg-pink-100 text-pink-800 border-pink-200' : 'bg-pink-50 text-pink-700 border-pink-100',
      orange: selected ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-orange-50 text-orange-700 border-orange-100',
      indigo: selected ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100',
      gray: selected ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-gray-50 text-gray-700 border-gray-100'
    }
    return colors[color as keyof typeof colors] || colors.gray
  }

  const filteredCategories = LINKEDIN_FIELD_CATEGORIES.map(category => ({
    ...category,
    fields: category.fields.filter(field => 
      field.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.fields.length > 0)

  const selectAllFields = () => {
    const allFields = LINKEDIN_FIELD_CATEGORIES.flatMap(cat => cat.fields)
    const uniqueFields = Array.from(new Set(allFields)) // Remove duplicates
    onFieldsChange(uniqueFields)
  }

  const selectEssentialFields = () => {
    const essentialFields = LINKEDIN_FIELD_CATEGORIES.find(cat => cat.name === 'Essential')?.fields || []
    const combinedFields = Array.from(new Set([...selectedFields, ...essentialFields]))
    onFieldsChange(combinedFields)
  }

  const clearAllFields = () => {
    onFieldsChange([])
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex justify-between items-center">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Fields to Collect ({selectedFields.length} selected)
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Select the data fields you want to collect from LinkedIn
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={selectEssentialFields}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded"
          >
            + Essential
          </button>
          <button
            type="button"
            onClick={selectAllFields}
            className="text-xs text-green-600 hover:text-green-800 px-2 py-1 border border-green-200 rounded"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={clearAllFields}
            className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search fields..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
        {filteredCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.name)
          const selectedCount = getCategorySelectedCount(category)
          const allSelected = selectedCount === category.fields.length
          
          return (
            <div key={category.name} className="border-b border-gray-100 last:border-b-0">
              {/* Category Header */}
              <div className="flex items-center justify-between p-3 hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => toggleCategory(category.name)}
                  className="flex items-center space-x-2 flex-1 text-left"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                  )}
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getColorClasses(category.color)}`}>
                      {category.name}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {category.description}
                    </span>
                  </div>
                </button>
                
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {selectedCount}/{category.fields.length}
                  </span>
                  {allSelected ? (
                    <button
                      type="button"
                      onClick={() => deselectCategoryFields(category)}
                      className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded"
                    >
                      Deselect All
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectCategoryFields(category)}
                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded"
                    >
                      Select All
                    </button>
                  )}
                </div>
              </div>

              {/* Category Fields */}
              {isExpanded && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {category.fields.map((field) => {
                      const isSelected = selectedFields.includes(field)
                      return (
                        <label
                          key={field}
                          className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleFieldToggle(field)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`text-sm flex-1 ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                            {field}
                          </span>
                          {isSelected && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected fields summary */}
      {selectedFields.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-700">
              <span className="font-medium">{selectedFields.length} fields selected</span>
            </p>
            <button
              type="button"
              onClick={clearAllFields}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear all
            </button>
          </div>
          {selectedFields.length > 10 && (
            <p className="text-xs text-blue-600 mt-1">
              {selectedFields.slice(0, 10).join(', ')}, and {selectedFields.length - 10} more...
            </p>
          )}
          {selectedFields.length <= 10 && (
            <p className="text-xs text-blue-600 mt-1">
              {selectedFields.join(', ')}
            </p>
          )}
        </div>
      )}

      {selectedFields.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <p className="text-sm text-yellow-700">
            Please select at least one field to collect data.
          </p>
        </div>
      )}
    </div>
  )
}
