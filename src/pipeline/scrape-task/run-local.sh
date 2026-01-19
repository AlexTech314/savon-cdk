#!/bin/bash
# Local test script for scrape-task
# Usage: ./run-local.sh [place_id1,place_id2,...]
#
# Examples:
#   ./run-local.sh                                    # Scrape all businesses
#   ./run-local.sh ChIJ1234,ChIJ5678                 # Scrape specific place IDs
#   FORCE_RESCRAPE=true ./run-local.sh ChIJ1234      # Force re-scrape

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration - update these for your environment
BUSINESSES_TABLE_NAME="${BUSINESSES_TABLE_NAME:-Alpha-Stateful-BusinessesD76A4163-12N881B498O0A}"
CAMPAIGN_DATA_BUCKET="${CAMPAIGN_DATA_BUCKET:-alpha-app-campaigndatabucket2fed4f6d-sb8x41631s50}"
JOBS_TABLE_NAME="${JOBS_TABLE_NAME:-Alpha-Stateful-JobsDF1CC2D4-4NU1QL5NFYTU}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Detect platform (arm64 for Apple Silicon, amd64 for Intel)
PLATFORM="linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')"
echo "Detected platform: $PLATFORM"

# Build the Docker image for the correct platform
echo "Building scrape-task Docker image..."
docker build --platform "$PLATFORM" -f Dockerfile.local -t scrape-task-local .

# Parse place IDs from argument
PLACE_IDS=""
if [ -n "$1" ]; then
    PLACE_IDS="$1"
fi

# Build JOB_INPUT JSON
if [ -n "$PLACE_IDS" ]; then
    JOB_INPUT=$(cat <<EOF
{
  "jobId": "local-test-$(date +%s)",
  "placeIds": [$(echo "$PLACE_IDS" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')],
  "maxPagesPerSite": 10,
  "skipIfDone": ${SKIP_IF_DONE:-true},
  "forceRescrape": ${FORCE_RESCRAPE:-false}
}
EOF
)
else
    JOB_INPUT=$(cat <<EOF
{
  "jobId": "local-test-$(date +%s)",
  "maxPagesPerSite": 10,
  "skipIfDone": ${SKIP_IF_DONE:-true},
  "forceRescrape": ${FORCE_RESCRAPE:-false}
}
EOF
)
fi

echo ""
echo "JOB_INPUT: $JOB_INPUT"
echo ""

# Run the container with AWS credentials from host
# Mount ~/.aws to /root/.aws (node:20-slim runs as root)
docker run --rm \
    --platform "$PLATFORM" \
    -e AWS_REGION="$AWS_REGION" \
    -e AWS_DEFAULT_REGION="$AWS_REGION" \
    -e BUSINESSES_TABLE_NAME="$BUSINESSES_TABLE_NAME" \
    -e CAMPAIGN_DATA_BUCKET="$CAMPAIGN_DATA_BUCKET" \
    -e JOBS_TABLE_NAME="$JOBS_TABLE_NAME" \
    -e JOB_INPUT="$JOB_INPUT" \
    -v "$HOME/.aws:/root/.aws:ro" \
    scrape-task-local
