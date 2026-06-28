#!/usr/bin/env bash
# ==============================================================================
# bundle-for-ai.sh
# Produces a single, LLM-optimised context file of the entire project.
# Output: ai-context-<timestamp>.md  (in the project root)
#
# No external dependencies. Pure bash + standard macOS/Linux POSIX tools.
# Tested: macOS 14+ · Apple Silicon M1/M2/M3 · bash 3.2+
#
# Usage:  bash bundle-for-ai.sh [--out <path>] [--no-lockfile] [--xml]
#   --out <path>      Override output file path
#   --no-lockfile     Skip package-lock.json (default: skipped anyway, flag kept for clarity)
#   --xml             Emit XML envelope instead of Markdown (repomix-compatible)
# ==============================================================================
set -euo pipefail

# ── CLI args ──────────────────────────────────────────────────────────────────
OUT=""
EMIT_XML=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)        OUT="$2"; shift 2 ;;
    --no-lockfile) shift ;;            # lockfile always excluded; flag is a no-op
    --xml)        EMIT_XML=true; shift ;;
    *) echo "Unknown flag: $1" && exit 1 ;;
  esac
done

# ── Guard ─────────────────────────────────────────────────────────────────────
if [ ! -f "package.json" ]; then
  echo "✗  Run bundle-for-ai.sh from the project root (where package.json lives)."
  exit 1
fi

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_NAME=$(python3 -c "import json,sys; print(json.load(open('package.json')).get('name','project'))" 2>/dev/null || basename "$PWD")
PROJECT_VERSION=$(python3 -c "import json,sys; print(json.load(open('package.json')).get('version','0.0.0'))" 2>/dev/null || echo "0.0.0")
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S')
DATESTAMP=$(date '+%Y%m%d-%H%M%S')
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "n/a")
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "n/a")

if [ -z "$OUT" ]; then
  OUT="ai-context-${DATESTAMP}.md"
fi

# ── Files to ALWAYS exclude ───────────────────────────────────────────────────
# Patterns matched against the full relative path (grep -E)
EXCLUDE_PATTERNS=(
  "^\.next/"
  "^node_modules/"
  "^\.git/"
  "package-lock\.json$"
  "yarn\.lock$"
  "pnpm-lock\.yaml$"
  "^\.turbo/"
  "^out/"
  "^dist/"
  "^build/"
  "\.map$"
  "\.ico$"
  "\.png$"
  "\.jpg$"
  "\.jpeg$"
  "\.gif$"
  "\.svg$"
  "\.woff$"
  "\.woff2$"
  "\.ttf$"
  "\.eot$"
  "\.DS_Store$"
  "__MACOSX"
  "\.env\.local$"
  "\.env\.production$"
  "^\.next"
  "fallback-build-manifest"
  "\.trace$"
)

# ── File priority order (processed in this sequence in the output) ────────────
# Files listed here appear first; everything else follows alphabetically.
PRIORITY_FILES=(
  "package.json"
  "tsconfig.json"
  "next.config.ts"
  "postcss.config.mjs"
  "eslint.config.mjs"
  "src/app/globals.css"
  "src/app/layout.tsx"
  "src/app/page.tsx"
  "src/lib/store.ts"
)

# ── Extensions to include ─────────────────────────────────────────────────────
INCLUDE_EXT="ts|tsx|js|jsx|mjs|cjs|css|json|md|sh|txt|env\.example|toml|yaml|yml"

# ── Helpers ───────────────────────────────────────────────────────────────────

is_excluded() {
  local path="$1"
  for pat in "${EXCLUDE_PATTERNS[@]}"; do
    if echo "$path" | grep -qE "$pat"; then
      return 0
    fi
  done
  return 1
}

is_included_ext() {
  local path="$1"
  echo "$path" | grep -qE "\.(${INCLUDE_EXT})$"
}

is_binary() {
  # Returns 0 (true) if the file contains non-text bytes
  file --mime "$1" 2>/dev/null | grep -qv "text/"
}

count_tokens_approx() {
  # GPT/Gemini: ~4 chars per token on average
  local chars
  chars=$(wc -c < "$1" | tr -d ' ')
  echo $(( chars / 4 ))
}

md_fence_lang() {
  case "${1##*.}" in
    ts|tsx)   echo "typescript" ;;
    js|jsx)   echo "javascript" ;;
    mjs|cjs)  echo "javascript" ;;
    css)      echo "css" ;;
    json)     echo "json" ;;
    sh)       echo "bash" ;;
    md)       echo "markdown" ;;
    yaml|yml) echo "yaml" ;;
    toml)     echo "toml" ;;
    *)        echo "" ;;
  esac
}

# ── Collect all candidate files ───────────────────────────────────────────────
echo "▶ Scanning project files..."

ALL_FILES=()
while IFS= read -r -d '' f; do
  rel="${f#./}"
  if is_excluded "$rel"; then continue; fi
  if ! is_included_ext "$rel"; then continue; fi
  if is_binary "$f" 2>/dev/null; then continue; fi
  ALL_FILES+=("$rel")
done < <(find . -type f -print0 | sort -z)

# ── Resolve priority-first order ──────────────────────────────────────────────
ORDERED_FILES=()
SEEN=()

for pf in "${PRIORITY_FILES[@]}"; do
  if [ -f "$pf" ]; then
    ORDERED_FILES+=("$pf")
    SEEN+=("$pf")
  fi
done

for f in "${ALL_FILES[@]}"; do
  already=false
  for s in "${SEEN[@]}"; do
    if [ "$s" = "$f" ]; then already=true; break; fi
  done
  if ! $already; then
    ORDERED_FILES+=("$f")
    SEEN+=("$f")
  fi
done

FILE_COUNT=${#ORDERED_FILES[@]}
echo "✓ ${FILE_COUNT} files selected."

# ── Build directory tree ──────────────────────────────────────────────────────
build_tree() {
  # Pure bash tree using find; no external 'tree' binary required
  find . -not -path "./.git/*" \
         -not -path "./node_modules/*" \
         -not -path "./.next/*" \
         -not -path "./out/*" \
         -not -path "./dist/*" \
         -not -name ".DS_Store" \
    | sort \
    | sed -e 's|[^/]*/|  |g' -e 's|  \([^/]*\)$|└─ \1|'
}

# ── Write output ──────────────────────────────────────────────────────────────
echo "▶ Writing context bundle → ${OUT}"

{
if $EMIT_XML; then
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# XML MODE  (repomix-compatible envelope)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat << XML_HEAD
<?xml version="1.0" encoding="UTF-8"?>
<repository>
<metadata>
  <name>${PROJECT_NAME}</name>
  <version>${PROJECT_VERSION}</version>
  <bundled_at>${TIMESTAMP}</BUNDLED_AT>
  <git_branch>${GIT_BRANCH}</git_branch>
  <git_hash>${GIT_HASH}</git_hash>
  <file_count>${FILE_COUNT}</file_count>
</metadata>

<ai_instructions>
You are a senior full-stack engineer working on this Next.js 16 / React 19 / TypeScript
project. When asked to make changes:

1. ALWAYS emit a self-contained bash script (setup-*.sh or patch-*.sh).
2. The script MUST be idempotent: running it twice produces no error and no duplicate content.
3. Use heredoc syntax (cat > path/file.ext << 'EOF' ... EOF) for every file write.
4. Purge .next/ at the end of every script that touches src/.
5. Never modify node_modules, package-lock.json, or .next/ directly.
6. Preserve TypeScript strict mode: noImplicitAny, noUncheckedIndexedAccess.
7. After writing, always run: npx tsc --noEmit
8. Output the script in a ```bash code block, nothing else.
</ai_instructions>

<directory_tree>
XML_HEAD
  build_tree
  echo "</directory_tree>"
  echo ""
  echo "<files>"

  for f in "${ORDERED_FILES[@]}"; do
    lang=$(md_fence_lang "$f")
    tok=$(count_tokens_approx "$f")
    echo "  <file path=\"${f}\" lang=\"${lang}\" approx_tokens=\"${tok}\">"
    echo "    <![CDATA["
    cat "$f"
    echo "    ]]>"
    echo "  </file>"
    echo ""
  done

  echo "</files>"
  echo "</repository>"

else
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MARKDOWN MODE  (default — best for Gemini, Claude, GPT-4o)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat << 'MD_HEAD'
<!--
  ============================================================
  AI CONTEXT BUNDLE
  Generated by bundle-for-ai.sh — do not edit manually.
  ============================================================
-->
MD_HEAD

cat << MD_META
# Project: ${PROJECT_NAME} · v${PROJECT_VERSION}

| Field        | Value |
|---|---|
| Bundled at   | ${TIMESTAMP} |
| Git branch   | ${GIT_BRANCH} |
| Git commit   | ${GIT_HASH} |
| Files        | ${FILE_COUNT} |

MD_META

cat << 'MD_INSTR'
---

## Instructions for the AI

You are a senior full-stack engineer. This bundle contains the **complete source** of the project.

### When you are asked to make a change, emit ONE self-contained bash script and nothing else.

Rules for every script you emit:

1. **Idempotent** — running twice produces no error, no duplicates.
2. **Heredoc writes** — use `cat > path/to/file.ext << 'EOF' … EOF` for every file.
   Never use `echo` chains for multi-line files.
3. **Cache purge** — add `rm -rf .next` at the end of any script that touches `src/`.
4. **Guard clause** — the first lines must be:
   ```bash
   set -euo pipefail
   [ -f package.json ] || { echo "Run from project root."; exit 1; }
   ```
5. **TypeScript contract** — preserve `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`.
   If you add a new file, it must pass `npx tsc --noEmit`.
6. **No forbidden writes** — never touch `node_modules/`, `package-lock.json`, `.next/`.
7. **Wrap in a bash fence** — output the script inside ` ```bash … ``` ` only.

---

## Directory Tree

```
MD_INSTR

  build_tree

  echo '```'
  echo ""
  echo "---"
  echo ""
  echo "## Source Files"
  echo ""
  echo "> Files are ordered: config → app entry → lib → components → docs → scripts"
  echo ""

  for f in "${ORDERED_FILES[@]}"; do
    lang=$(md_fence_lang "$f")
    tok=$(count_tokens_approx "$f")
    lines=$(wc -l < "$f" | tr -d ' ')
    bytes=$(wc -c < "$f" | tr -d ' ')

    echo "---"
    echo ""
    echo "### \`${f}\`"
    echo ""
    echo "> ${lines} lines · ${bytes} bytes · ~${tok} tokens"
    echo ""
    echo "\`\`\`${lang}"
    cat "$f"
    # ensure trailing newline before closing fence
    tail -c1 "$f" | grep -q $'\n' || echo ""
    echo "\`\`\`"
    echo ""
  done

  echo "---"
  echo ""
  echo "*End of context bundle. Total files: ${FILE_COUNT}.*"

fi
} > "$OUT"

# ── Stats ─────────────────────────────────────────────────────────────────────
TOTAL_BYTES=$(wc -c < "$OUT" | tr -d ' ')
TOTAL_LINES=$(wc -l < "$OUT" | tr -d ' ')
TOTAL_TOKENS=$(( TOTAL_BYTES / 4 ))

# Gemini 1.5 Pro context: 1M tokens; 2.0 Flash: 1M; GPT-4o: 128k
GEMINI_PCT=$(( TOTAL_TOKENS * 100 / 1000000 ))
GPT4O_PCT=$(( TOTAL_TOKENS * 100 / 128000 ))

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✓  Context bundle ready                                ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║   File    %-43s ║\n" "$OUT"
printf "║   Size    %-43s ║\n" "${TOTAL_BYTES} bytes · ${TOTAL_LINES} lines"
printf "║   Tokens  ≈%-43s ║\n" "${TOTAL_TOKENS} (4 chars/token estimate)"
echo "║                                                          ║"
printf "║   Gemini 1.5/2.0 Pro  (1 M ctx)  %3d%% used            ║\n" "$GEMINI_PCT"
printf "║   GPT-4o              (128k ctx)  %3d%% used            ║\n" "$GPT4O_PCT"
echo "║                                                          ║"
echo "║   Paste the file into your AI chat, then describe        ║"
echo "║   the change you want. The model will return a           ║"
echo "║   ready-to-run bash script.                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""