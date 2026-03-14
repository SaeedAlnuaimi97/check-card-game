#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Check Card Game — Database Management Script
# Usage:
#   ./scripts/db.sh flush [--remote]           # Drop entire database
#   ./scripts/db.sh delete-user <guestId> [--remote]  # Delete user and their records
#   ./scripts/db.sh list-users [--remote]      # List all guest profiles
# ============================================================

# --- Configuration ---
LOCAL_URI="mongodb://localhost:27017/check-card-game"
RESOURCE_GROUP="check-card-game-rg"
COSMOS_ACCOUNT="check-card-game-cosmo-db"
# ---------------------

get_uri() {
  local remote="${1:-false}"
  if [ "$remote" = "true" ]; then
    echo "==> Fetching Cosmos DB connection string..." >&2
    local uri
    uri=$(az cosmosdb keys list \
      --name "$COSMOS_ACCOUNT" \
      --resource-group "$RESOURCE_GROUP" \
      --type connection-strings \
      --query "connectionStrings[0].connectionString" -o tsv)
    # Append database name before the query params
    echo "${uri/\?//check-card-game?}"
  else
    echo "$LOCAL_URI"
  fi
}

is_remote() {
  for arg in "$@"; do
    if [ "$arg" = "--remote" ]; then
      echo "true"
      return
    fi
  done
  echo "false"
}

flush_db() {
  local remote
  remote=$(is_remote "$@")
  local uri
  uri=$(get_uri "$remote")

  if [ "$remote" = "true" ]; then
    echo "⚠️  WARNING: This will drop the PRODUCTION database on Cosmos DB!"
    read -rp "Type 'yes' to confirm: " confirm
    if [ "$confirm" != "yes" ]; then
      echo "Aborted."
      exit 1
    fi
  fi

  local target="local"
  [ "$remote" = "true" ] && target="remote (Cosmos DB)"
  echo "==> Flushing $target database..."

  mongosh "$uri" --quiet --eval "
    db.getCollectionNames().forEach(function(c) {
      print('  Dropping: ' + c);
      db[c].drop();
    });
    print('Database flushed.');
  "
}

delete_user() {
  local guest_id="${1:-}"
  if [ -z "$guest_id" ]; then
    echo "Error: guestId is required"
    echo "Usage: $0 delete-user <guestId> [--remote]"
    exit 1
  fi

  local remote
  remote=$(is_remote "$@")
  local uri
  uri=$(get_uri "$remote")

  local target="local"
  [ "$remote" = "true" ] && target="remote (Cosmos DB)"
  echo "==> Deleting user '$guest_id' from $target database..."

  mongosh "$uri" --quiet --eval "
    // Delete guest profile
    const profileResult = db.guestprofiles.deleteMany({ guestId: '$guest_id' });
    print('  Guest profiles deleted: ' + profileResult.deletedCount);

    // Delete game results where this user participated
    const gameResult = db.gameresults.deleteMany({ 'players.guestId': '$guest_id' });
    print('  Game results deleted: ' + gameResult.deletedCount);

    // Remove from any active rooms
    const roomResult = db.rooms.updateMany(
      { 'players.guestId': '$guest_id' },
      { \\\$pull: { players: { guestId: '$guest_id' } } }
    );
    print('  Rooms updated: ' + roomResult.modifiedCount);

    print('User deleted.');
  "
}

list_users() {
  local remote
  remote=$(is_remote "$@")
  local uri
  uri=$(get_uri "$remote")

  local target="local"
  [ "$remote" = "true" ] && target="remote (Cosmos DB)"
  echo "==> Listing users from $target database..."

  mongosh "$uri" --quiet --eval "
    const users = db.guestprofiles.find({}, { _id: 0, guestId: 1, username: 1, lastSeenAt: 1 }).sort({ lastSeenAt: -1 }).toArray();
    if (users.length === 0) {
      print('  No users found.');
    } else {
      print('  ' + users.length + ' user(s):');
      print('  ' + '-'.repeat(60));
      users.forEach(function(u) {
        const seen = u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : 'unknown';
        print('  ' + u.username.padEnd(20) + u.guestId.padEnd(25) + seen);
      });
    }
  "
}

case "${1:-}" in
  flush)
    shift
    flush_db "$@"
    ;;
  delete-user)
    shift
    delete_user "$@"
    ;;
  list-users)
    shift
    list_users "$@"
    ;;
  *)
    echo "Check Card Game — Database Management"
    echo ""
    echo "Usage:"
    echo "  $0 flush [--remote]                Drop entire database"
    echo "  $0 delete-user <guestId> [--remote] Delete a user and their game records"
    echo "  $0 list-users [--remote]           List all guest profiles"
    echo ""
    echo "Add --remote to target the production Cosmos DB instead of local MongoDB."
    ;;
esac
