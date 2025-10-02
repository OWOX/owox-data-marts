# Pages Directory

This directory contains React components that represent complete pages or views in the OWOX Data Marts application. Each
file corresponds to a specific route defined in the application's routing configuration.

## Structure

- Each page component is exported as a default export
- Pages are used in conjunction with the MainLayout component
- All pages have access to the global navigation through the MainLayout wrapper

## Usage

Pages are referenced in the application's routing configuration and rendered through the React Router's outlet in the
MainLayout component.
