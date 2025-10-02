#!/bin/bash

# Array of folders to run clasp commands in
folders=("Sources/BankOfCanada" "Sources/FacebookMarketing" "Sources/OpenExchangeRates" "Sources/TikTokAds" "Sources/LinkedInAds" "Sources/LinkedInPages" "Sources/BingAds" "Sources/XAds" "Sources/CriteoAds" "Templates/PublicEndPoint" "Templates/Token-Based")

# Exit script on any error
set -e

# Navigate to the parent directory for git pull
cd "$(dirname "$0")/.." || { echo "Failed to navigate to parent directory"; exit 1; }

# Perform git pull
echo "Performing git pull in $(pwd)..."
git pull

# Check for conflicts
if git ls-files -u | grep -q .; then
  echo "Merge conflicts detected. Resolve conflicts first and try again."
  exit 1
fi

echo "No conflicts detected. Proceeding with clasp commands."

# Loop through each folder and run clasp commands
for folder in "${folders[@]}"; do
  echo "Entering folder: $folder"
  cd "src/$folder" || { echo "Failed to change directory to $folder"; exit 1; }

  # Run your clasp commands here
  echo "Running clasp in $folder..."
  clasp push
  #clasp deploy --deploymentId your-deployment-id  # Adjust clasp commands as needed

  # Return to the original directory
  cd - > /dev/null || exit
done

echo "All operations completed successfully."