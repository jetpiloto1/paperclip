#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/rotate-github-token.sh <new-token> [--cluster CLUSTER] [--service SERVICE]

Rotate the GitHub PAT used by the Paperclip ECS deployment.

Steps:
  1. Updates the paperclip/github-token secret in AWS Secrets Manager
  2. Forces a new ECS deployment so the task picks up the new token
  3. Waits for the deployment to complete
  4. Verifies the service is healthy

The token needs minimum scopes:
  - repo (full control) — needed by AI agents for clone/push/PR operations

Examples:
  ./scripts/rotate-github-token.sh ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ./scripts/rotate-github-token.sh ghp_xxxx --cluster my-cluster --service my-service

Environment:
  AWS_REGION            AWS region (default: us-east-1)
  AWS_PROFILE           AWS CLI profile (optional)
  CLUSTER               ECS cluster name (default: paperclip)
  SERVICE               ECS service name (default: paperclip-server)
EOF
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

NEW_TOKEN="$1"
shift

AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER="${CLUSTER:-paperclip}"
ECS_SERVICE="${SERVICE:-paperclip-server}"

while [ $# -gt 0 ]; do
  case "$1" in
    --cluster) ECS_CLUSTER="$2"; shift 2 ;;
    --service) ECS_SERVICE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

echo "=== GitHub Token Rotation ==="
echo "Target cluster: $ECS_CLUSTER"
echo "Target service: $ECS_SERVICE"
echo "AWS Region:     $AWS_REGION"

# Validate the token looks reasonable
if ! echo "$NEW_TOKEN" | grep -qE '^gh[pousr]_'; then
  if echo "$NEW_TOKEN" | grep -qE '^[a-f0-9]{40}$'; then
    echo "Token looks like a legacy 40-char hex PAT (no prefix). This is deprecated; consider creating a fine-grained PAT with a gh*_ prefix."
  else
    echo "Warning: token doesn't match expected GitHub PAT format (gh[pousr]_* or 40-char hex). Proceeding anyway..."
  fi
fi

# Check AWS CLI
if ! command -v aws &>/dev/null; then
  echo "Error: AWS CLI is not installed. Install it first: https://aws.amazon.com/cli/"
  exit 1
fi

if ! aws sts get-caller-identity &>/dev/null; then
  echo "Error: AWS CLI is not authenticated. Run 'aws configure' or set AWS_PROFILE."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account: $ACCOUNT_ID"

SECRET_ARN="arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:paperclip/github-token"

# ---- Step 1: Update the secret ----
echo ""
echo "Step 1/4: Updating AWS Secrets Manager secret paperclip/github-token..."
if aws secretsmanager describe-secret --secret-id "$SECRET_ARN" &>/dev/null; then
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_ARN" \
    --secret-string "$NEW_TOKEN"
  echo "  Secret updated."
else
  echo "  Secret does not exist yet. Creating..."
  aws secretsmanager create-secret \
    --name paperclip/github-token \
    --secret-string "$NEW_TOKEN"
  echo "  Secret created."
fi

# ---- Step 2: Verify the secret was stored ----
echo ""
echo "Step 2/4: Verifying secret..."
STORED=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query SecretString --output text)
if [ "$STORED" = "$NEW_TOKEN" ]; then
  echo "  Secret verified."
else
  echo "  Error: stored value doesn't match. Aborting."
  exit 1
fi

# ---- Step 3: Force ECS redeployment ----
echo ""
echo "Step 3/4: Forcing new ECS deployment..."
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment \
  --output json \
  --query 'service.{status:status,desired:desiredCount,running:runningCount,deployments:deployments[0].rolloutState}'
echo "  Deployment triggered."

# ---- Step 4: Wait for deployment to complete ----
echo ""
echo "Step 4/4: Waiting for deployment to stabilize..."
echo "  (This may take 2-5 minutes...)"

if aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" 2>/dev/null; then
  echo "  Deployment stable."
else
  echo "  Warning: wait command timed out or failed. Checking service status..."
fi

# Final health check
echo ""
echo "=== Final Deployment Status ==="
aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount,deployments:deployments[0].rolloutState,events:events[0:3]}' \
  --output json

echo ""
echo "=== Deployment Events (last 3) ==="
aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].events[0:3].[message]' \
  --output text

echo ""
echo "=== Token Rotation Complete ==="
echo "Verify manually:"
echo "  1. Check logs:  aws logs tail /ecs/paperclip --since 5m --follow"
echo "  2. Health endpoint: curl -sf https://<DOMAIN>/api/health"
echo "  3. gh auth check:  gh auth status"
