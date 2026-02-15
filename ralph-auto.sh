#!/bin/bash

# Ralph Auto Loop - Autonomous AI coding agent that implements specs
#
# This script runs an autonomous agent (via OpenCode) to implement a specific task.
# A focus prompt is REQUIRED - the agent will only do what you ask.

set -e
set -o pipefail

SKIP_CHECKS=false
FOCUS_PROMPT=""
MAX_ITERATIONS=0
USE_JUDGE=false
JUDGE_FIRST=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-checks) SKIP_CHECKS=true; shift ;;
        --max-iterations)
            if [[ -n "$2" && "$2" =~ ^[0-9]+$ ]]; then
                MAX_ITERATIONS="$2"; shift 2
            else
                echo "Error: --max-iterations requires a positive integer"; exit 1
            fi ;;
        --judge) USE_JUDGE=true; shift ;;
        --judge-first) JUDGE_FIRST=true; USE_JUDGE=true; shift ;;
        --help|-h)
            echo "Usage: ./ralph-auto.sh <focus prompt> [options]"
            echo ""
            echo "Options:"
            echo "  --skip-checks        Skip CI checks"
            echo "  --max-iterations <n> Limit iterations"
            echo "  --judge              Enable judge agent"
            echo "  --judge-first        Run judge before starting"
            echo "  --help               Show this help"
            echo ""
            echo "Configuration: ralph-auto.jsonc (required)"
            echo "  specsDir      Directory containing specs"
            echo "  model         OpenCode model"
            echo "  variant       OpenCode variant"
            echo "  commitPrefix  Git commit prefix"
            echo "  checks        Array of {name, command} CI checks"
            exit 0 ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *)
            if [[ -z "$FOCUS_PROMPT" ]]; then FOCUS_PROMPT="$1"
            else echo "Error: Multiple focus prompts provided"; exit 1
            fi
            shift ;;
    esac
done

if [[ -z "$FOCUS_PROMPT" ]]; then
    echo "Error: A focus prompt is required"
    echo "Usage: ./ralph-auto.sh <focus prompt> [options]"
    exit 1
fi

COMPLETE_MARKER="NOTHING_LEFT_TO_DO"
OUTPUT_DIR=".ralph-auto"
CONFIG_FILE="ralph-auto.jsonc"

# Strip JSONC comments and parse JSON
parse_jsonc() {
    sed 's|//.*$||g; s|/\*.*\*/||g' "$CONFIG_FILE" | jq -c '.'
}

# Load config (called after config file check)
load_config() {
    local config
    config=$(parse_jsonc)
    SPECS_DIR=$(echo "$config" | jq -r '.specsDir')
    OPENCODE_MODEL=$(echo "$config" | jq -r '.model')
    OPENCODE_VARIANT=$(echo "$config" | jq -r '.variant')
    COMMIT_PREFIX=$(echo "$config" | jq -r '.commitPrefix')
}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cleanup() {
    pkill -P $$ 2>/dev/null || true
    if [ -d "$OUTPUT_DIR" ]; then
        rm -rf "$OUTPUT_DIR"
        echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} Cleaned up $OUTPUT_DIR"
    fi
}

handle_signal() {
    echo ""
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} Received interrupt signal, shutting down..."
    cleanup
    exit 130
}

trap cleanup EXIT
trap handle_signal INT TERM

mkdir -p "$OUTPUT_DIR"

log() {
    local level=$1; shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    case $level in
        "INFO")  echo -e "${BLUE}[$timestamp]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}[$timestamp]${NC} $message" ;;
        "WARN")  echo -e "${YELLOW}[$timestamp]${NC} $message" ;;
        "ERROR") echo -e "${RED}[$timestamp]${NC} $message" ;;
    esac
    echo "[$timestamp] [$level] $message" >> "$OUTPUT_DIR/ralph-auto.log"
}

check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    command -v opencode &> /dev/null || { log "ERROR" "OpenCode is not installed"; exit 1; }
    command -v jq &> /dev/null || { log "ERROR" "jq is not installed"; exit 1; }
    git rev-parse --git-dir > /dev/null 2>&1 || { log "ERROR" "Not in a git repository"; exit 1; }
    [ -f "$CONFIG_FILE" ] || { log "ERROR" "$CONFIG_FILE not found"; exit 1; }
    
    # Validate config has all required fields
    local config
    config=$(parse_jsonc) || { log "ERROR" "$CONFIG_FILE is not valid JSON"; exit 1; }
    
    local missing=""
    echo "$config" | jq -e '.specsDir' > /dev/null 2>&1 || missing+=" specsDir"
    echo "$config" | jq -e '.model' > /dev/null 2>&1 || missing+=" model"
    echo "$config" | jq -e '.variant' > /dev/null 2>&1 || missing+=" variant"
    echo "$config" | jq -e '.commitPrefix' > /dev/null 2>&1 || missing+=" commitPrefix"
    echo "$config" | jq -e '.checks | length > 0' > /dev/null 2>&1 || missing+=" checks"
    
    [ -n "$missing" ] && { log "ERROR" "$CONFIG_FILE missing required fields:$missing"; exit 1; }
    
    # Load config values
    load_config
    log "INFO" "Model: $OPENCODE_MODEL, Variant: $OPENCODE_VARIANT"
    
    [ -d "$SPECS_DIR" ] || { log "ERROR" "$SPECS_DIR/ directory not found"; exit 1; }
    local spec_count=$(find "$SPECS_DIR" -name "*.md" -type f | wc -l | tr -d ' ')
    [ "$spec_count" -eq 0 ] && { log "ERROR" "No .md files in $SPECS_DIR/"; exit 1; }
    log "INFO" "Found $spec_count spec(s) in $SPECS_DIR/"
    log "SUCCESS" "Prerequisites check passed"
}

has_changes() {
    ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]
}

# Filter opencode JSON output
stream_filter() {
    local last_was_tool=false
    while IFS= read -r line; do
        local event_type
        event_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
        case "$event_type" in
            "text"|"message"|"assistant"|"output_text"|"output_text_delta"|"final")
                local text
                text=$(echo "$line" | jq -r '
                    if .type == "text" then .part.text // empty
                    elif .type == "output_text" then .part.text // .text // empty
                    elif .type == "output_text_delta" then .part.delta // .delta // empty
                    elif .type == "final" then .part.text // .text // empty
                    elif .type == "message" or .type == "assistant" then
                        (
                            .part.text // empty,
                            (.part.content[]? | select(.type == "text" or .type == "output_text") | .text // empty),
                            (.part.content[]? | select(.type == "output_text_delta") | .delta // empty)
                        )
                    else empty end
                ' 2>/dev/null)
                if [ -n "$text" ]; then
                    $last_was_tool && echo ""
                    printf "%s" "$text"
                    last_was_tool=false
                fi
                ;;
            "tool_use")
                local tool_name tool_detail input
                tool_name=$(echo "$line" | jq -r '.part.tool // empty' 2>/dev/null)
                tool_detail=$(echo "$line" | jq -r '.part.state.title // empty' 2>/dev/null)
                if [ -z "$tool_detail" ]; then
                    input=$(echo "$line" | jq -c '.part.state.input // {}' 2>/dev/null)
                    case "$tool_name" in
                        read)      tool_detail=$(echo "$input" | jq -r '.filePath // empty') ;;
                        write)     tool_detail=$(echo "$input" | jq -r '.filePath // empty') ;;
                        edit)      tool_detail=$(echo "$input" | jq -r '.filePath // empty') ;;
                        glob)      tool_detail=$(echo "$input" | jq -r '.pattern // empty') ;;
                        grep)      tool_detail=$(echo "$input" | jq -r '"\(.pattern // "")" + (if .include then " (\(.include))" else "" end)') ;;
                        bash)      tool_detail=$(echo "$input" | jq -r '.description // (.command | .[0:50]) // empty') ;;
                        task)      tool_detail=$(echo "$input" | jq -r '.description // empty') ;;
                        webfetch)  tool_detail=$(echo "$input" | jq -r '.url // empty' | head -c 50) ;;
                        question)  tool_detail=$(echo "$input" | jq -r '.questions[0].header // empty') ;;
                        todowrite) tool_detail="updating todos" ;;
                        todoread)  tool_detail="reading todos" ;;
                        skill)     tool_detail=$(echo "$input" | jq -r '.name // empty') ;;
                    esac
                fi
                if [ -n "$tool_name" ]; then
                    $last_was_tool || echo ""
                    echo -e "${BLUE}> ${tool_name}${tool_detail:+: $tool_detail}${NC}"
                    last_was_tool=true
                fi
                ;;
            "error")
                local error_msg
                error_msg=$(echo "$line" | jq -r '.error.message // .error // "Unknown error"' 2>/dev/null)
                echo -e "\n${RED}Error: $error_msg${NC}"
                last_was_tool=false
                ;;
            "step_finish")
                $last_was_tool || echo ""
                ;;
        esac
    done
    echo ""
}

load_ci_checks() {
    parse_jsonc | jq -c '.checks'
}

run_ci_checks() {
    log "INFO" "Running CI checks..."
    local ci_failed=0
    local error_output=""
    local checks
    checks=$(load_ci_checks)
    local check_count
    check_count=$(echo "$checks" | jq 'length')

    echo "=========================================="
    echo "Running CI Checks"
    echo "=========================================="

    local i=0
    while [ $i -lt "$check_count" ]; do
        local name command check_output
        name=$(echo "$checks" | jq -r ".[$i].name")
        command=$(echo "$checks" | jq -r ".[$i].command")
        
        echo -e "\n$((i+1)). $name...\n$(printf '%*s' ${#name} '' | tr ' ' '-')---"
        
        if check_output=$(eval "$command" 2>&1); then
            echo -e "${GREEN}$name passed${NC}"
        else
            echo -e "${RED}$name failed${NC}"
            ci_failed=1
            error_output+="## $name Failed\n\`\`\`\n$check_output\n\`\`\`\n\n"
        fi
        
        ((i++))
    done

    echo -e "\n=========================================="
    if [ $ci_failed -eq 0 ]; then
        echo -e "${GREEN}All CI checks passed!${NC}"
        log "SUCCESS" "CI checks passed"
        return 0
    else
        echo -e "${RED}CI checks failed!${NC}"
        log "ERROR" "CI checks failed"
        echo -e "# CI Check Failures\n\n$error_output" > "$OUTPUT_DIR/ci_errors.txt"
        return 1
    fi
}

commit_changes() {
    local iteration="$1" task_summary="$2"
    log "INFO" "Committing changes..."
    git add -A
    git diff --cached --quiet && { log "WARN" "No changes to commit"; return 0; }
    if git commit -m "$COMMIT_PREFIX: $task_summary

Ralph-Auto-Iteration: $iteration

Automated commit by Ralph Auto loop."; then
        log "SUCCESS" "Committed: $task_summary"
    else
        log "ERROR" "Commit failed"; return 1
    fi
}

rollback_changes() {
    log "WARN" "Rolling back uncommitted changes..."
    git checkout -- .
    git clean -fd
}

build_prompt() {
    local iteration=$1 ci_errors="" focus_section=""

    [ -f "$OUTPUT_DIR/ci_errors.txt" ] && ci_errors="## Previous Iteration Errors

**CI checks failed. You MUST fix these errors.**

Read: \`$OUTPUT_DIR/ci_errors.txt\`
"

    [ -n "$FOCUS_PROMPT" ] && focus_section="## FOCUS MODE

**Work ONLY on:** $FOCUS_PROMPT

Signal TASK_COMPLETE when done.
"

    local specs_list=$(find "$SPECS_DIR" -name "*.md" -type f | sort | while read f; do echo "- \`$f\`"; done)
    
    # Build CI checks list from config
    local checks_list=""
    local commands_table=""
    local checks
    checks=$(load_ci_checks)
    local check_count
    check_count=$(echo "$checks" | jq 'length')
    local i=0
    while [ $i -lt "$check_count" ]; do
        local name command
        name=$(echo "$checks" | jq -r ".[$i].name")
        command=$(echo "$checks" | jq -r ".[$i].command")
        checks_list+="$((i+1)). \`$command\` - $name must pass
"
        commands_table+="| \`$command\` | $name (CI) |
"
        ((i++))
    done
    
    # Add additional commands from config
    local extra_commands
    extra_commands=$(parse_jsonc | jq -c '.commands // []')
    local extra_count
    extra_count=$(echo "$extra_commands" | jq 'length')
    i=0
    while [ $i -lt "$extra_count" ]; do
        local name command
        name=$(echo "$extra_commands" | jq -r ".[$i].name")
        command=$(echo "$extra_commands" | jq -r ".[$i].command")
        commands_table+="| \`$command\` | $name |
"
        ((i++))
    done

    cat <<PROMPT_EOF
# Ralph Auto Loop - Autonomous Implementation Agent

You are an autonomous coding agent working on a focused topic.

## Focus Mode

The **focus input** specifies the topic you should work on. Within that topic:
- You **select your own tasks** based on what needs to be done
- You complete **one task at a time**, then signal completion
- You **update specs** to track task status as you work
- You may **create new tasks** if you discover they are needed
- When all work for the focus topic is complete, signal that nothing is left to do

## The $SPECS_DIR/ Directory

The \`$SPECS_DIR/\` directory contains all documentation about this application:
- **Implementation plans** - specifications for features to be built
- **Best practices** - conventions for Rust, testing, etc.
- **Architecture context** - how the app has been built and why

Use these files as reference when implementing tasks. Read relevant specs before making changes.

**Available specs:**

$specs_list

## Critical Rules

1. **STAY ON TOPIC**: Work only on tasks related to the focus input. Do not work on unrelated areas.
2. **DO NOT COMMIT**: The Ralph Auto script handles all git commits. Just write code.
3. **CI MUST BE GREEN**: Your code MUST pass all CI checks before signaling completion.
4. **ONE TASK PER ITERATION**: Complete one task, signal completion, then STOP.
5. **UPDATE SPECS**: Update spec files to mark tasks complete, add new tasks, or track progress.

## Signals

### TASK_COMPLETE

When you have finished a task AND verified CI is green, output **exactly** this format:

\`\`\`
TASK_COMPLETE: Brief description of what you implemented
\`\`\`

**FORMAT REQUIREMENTS (the script parses this for git commit):**
- Must be on its own line
- Must start with exactly \`TASK_COMPLETE:\` (with colon)
- Description follows the colon and space
- Description becomes the git commit message - keep it concise (one line, under 72 chars)
- No markdown formatting, no backticks, no extra text around it

**Examples:**
- \`TASK_COMPLETE: Added user authentication with JWT tokens\`
- \`TASK_COMPLETE: Fixed currency conversion bug in reports\`

**After outputting TASK_COMPLETE, STOP IMMEDIATELY.** Do not start the next task.

## Progress Updates

While working, emit brief status text between tool batches so the operator can follow your reasoning. Keep it concise:

- Before the first tool call, print 1 short sentence stating the task you chose.
- After each batch of tool calls, print 1 short sentence describing what you learned or will do next.
- Do NOT add any extra text after \`TASK_COMPLETE\` or \`NOTHING_LEFT_TO_DO\`.

### NOTHING_LEFT_TO_DO

When all tasks for the focus topic are complete and there is no more work to do:

\`\`\`
NOTHING_LEFT_TO_DO
\`\`\`

**After outputting NOTHING_LEFT_TO_DO, STOP IMMEDIATELY.**

### Completing the Last Task

**IMPORTANT:** When you complete the LAST task for the focus topic, you MUST signal BOTH (each on its own line):

\`\`\`
TASK_COMPLETE: Brief description of what you implemented

NOTHING_LEFT_TO_DO
\`\`\`

This ensures the task gets committed (via TASK_COMPLETE) AND the loop exits (via NOTHING_LEFT_TO_DO). Always check if there are remaining tasks before deciding which signal(s) to use.

## CI Green Requirement

**A task is NOT complete until CI is green.**

Before signaling TASK_COMPLETE, run these checks in order:

$checks_list
**If any check fails, fix the errors before signaling completion.**

### Command Reference

| Command | Description |
|---|---|
$commands_table
## Workflow

1. **Check CI status** - if there are errors from a previous iteration, fix them first
2. **Read relevant specs** - understand the focus topic, context, and best practices
3. **Select a task** - choose one task to work on within the focus topic
4. **Implement** - follow patterns from specs
5. **Verify CI** - run the CI checks listed above
6. **Update spec** - mark the task complete, add new tasks if discovered
7. **Signal** - output \`TASK_COMPLETE: <description>\` or \`NOTHING_LEFT_TO_DO\` if all done
8. **STOP** - do not continue

## Important Reminders

- **Read \`AGENTS.md\`** for project structure and conventions
- **DO NOT run git commands** - the script handles commits
- **Create tasks as needed** - if you discover work that needs to be done within the focus topic, add it to the spec

---

## Iteration

This is iteration $iteration of the autonomous loop.

$focus_section
$ci_errors
## Begin

Review the focus topic above and select one task to work on. When the task is complete:
- If there are MORE tasks remaining: signal \`TASK_COMPLETE: <description>\` and STOP
- If this was the LAST task: signal BOTH \`TASK_COMPLETE: <description>\` AND \`NOTHING_LEFT_TO_DO\`, then STOP
PROMPT_EOF
}

extract_task_description() {
    local output_file="$1"
    local desc=$(cat "$output_file" | jq -r '
        if .type == "text" then .part.text // empty
        elif .type == "output_text" then .part.text // .text // empty
        elif .type == "output_text_delta" then .part.delta // .delta // empty
        elif .type == "final" then .part.text // .text // empty
        elif .type == "message" or .type == "assistant" then
            (
                .part.text // empty,
                (.part.content[]? | select(.type == "text" or .type == "output_text") | .text // empty),
                (.part.content[]? | select(.type == "output_text_delta") | .delta // empty)
            )
        else empty end
    ' 2>/dev/null | grep "TASK_COMPLETE:" | head -1 | sed 's/.*TASK_COMPLETE:[[:space:]]*//')
    echo "${desc:-Autonomous improvements}"
}

build_judge_prompt() {
    local focus="$1"
    local specs_list=$(find "$SPECS_DIR" -name "*.md" -type f | sort | while read f; do echo "- \`$f\`"; done)
    
    cat <<EOF
# Judge Agent - Work Completion Review

You are a judging agent that reviews whether implementation work is complete.

## Your Task

Review the codebase to determine if the following focus area has been fully implemented:

**Focus:** $focus

## Available Specs

$specs_list

## Review Checklist

Perform these checks in order:

### 1. Spec Review
- Read the relevant spec(s) for the focus area
- Check if all tasks/items are marked complete (look for checkboxes, status markers)
- Identify any tasks still marked as pending or in-progress

### 2. Code Completeness
- Search for \`TODO\`, \`FIXME\`, \`XXX\`, \`HACK\` comments in relevant code
- Search for \`todo!\(\)\`, \`unimplemented!\(\)\`, \`unreachable!\(\)\` macros
- Look for placeholder implementations or stub functions
- Check for \`panic!\(\)\` calls that should be proper error handling

### 3. Implementation Verification
- Verify the code matches what the spec requires
- Check that all specified features/functions exist
- Look for missing error handling or edge cases mentioned in spec

### 4. Test Coverage
- Check if tests mentioned in the spec exist
- Look for \`#[ignore]\` tests that should be enabled
- Verify test assertions match spec requirements

### 5. Integration
- Check if the implementation is wired up (not just dead code)
- Verify exports, public APIs, or entry points exist as specified

## Verdict

After your review, you MUST output exactly one of these signals on its own line:

\`\`\`
MORE_WORK_TO_DO
\`\`\`
OR
\`\`\`
ALL_WORK_DONE
\`\`\`

**Output \`MORE_WORK_TO_DO\` if ANY of these are true:**
- Tasks in the spec are not marked complete
- TODO/FIXME comments exist in the relevant code
- \`todo!()\` or \`unimplemented!()\` macros are present
- Implementation is missing or incomplete
- Tests are missing or ignored
- Code exists but isn't integrated

**Output \`ALL_WORK_DONE\` if ALL of these are true:**
- All tasks in the spec are marked complete
- No TODO/FIXME comments in relevant code
- No \`todo!()\` or \`unimplemented!()\` macros
- Implementation matches the spec requirements
- Tests exist and are not ignored
- Code is properly integrated

## Begin

Review the focus area above using the checklist. Be thorough - it's better to flag incomplete work than to miss something.
EOF
}

run_judge() {
    local iteration=$1
    local judge_output_file="$OUTPUT_DIR/iteration_${iteration}_judge_output.txt"
    local judge_stderr_file="$OUTPUT_DIR/iteration_${iteration}_judge_stderr.txt"
    local judge_prompt_file="$OUTPUT_DIR/iteration_${iteration}_judge_prompt.md"

    log "INFO" "Running judging agent..."

    build_judge_prompt "$FOCUS_PROMPT" > "$judge_prompt_file"

    local judge_exit_code=0
    if cat "$judge_prompt_file" | opencode run --model "$OPENCODE_MODEL" --variant "$OPENCODE_VARIANT" --format json 2>"$judge_stderr_file" | tee "$judge_output_file" | stream_filter; then
        log "SUCCESS" "Judge completed"
    else
        judge_exit_code=$?
        if [ $judge_exit_code -eq 130 ] || [ $judge_exit_code -eq 143 ]; then
            log "INFO" "Judge interrupted"; return 2
        fi
        log "WARN" "Judge exited with status $judge_exit_code"
    fi

    local judge_text=$(cat "$judge_output_file" | jq -r '
        if .type == "text" then .part.text // empty
        elif .type == "output_text" then .part.text // .text // empty
        elif .type == "output_text_delta" then .part.delta // .delta // empty
        elif .type == "final" then .part.text // .text // empty
        elif .type == "message" or .type == "assistant" then
            (
                .part.text // empty,
                (.part.content[]? | select(.type == "text" or .type == "output_text") | .text // empty),
                (.part.content[]? | select(.type == "output_text_delta") | .delta // empty)
            )
        else empty end
    ' 2>/dev/null)

    if echo "$judge_text" | grep -qE "(MORE_WORK_TO_DO|MORE WORK TO DO)"; then
        log "WARN" "Judge says: MORE_WORK_TO_DO"
        return 1
    elif echo "$judge_text" | grep -qE "(ALL_WORK_DONE|ALL WORK DONE)"; then
        log "SUCCESS" "Judge says: ALL_WORK_DONE"
        return 0
    else
        log "ERROR" "Judge did not produce a verdict (expected MORE_WORK_TO_DO or ALL_WORK_DONE)"
        log "WARN" "Assuming MORE_WORK_TO_DO to be safe"
        return 1
    fi
}

run_iteration() {
    local iteration=$1
    local output_file="$OUTPUT_DIR/iteration_${iteration}_output.txt"
    local stderr_file="$OUTPUT_DIR/iteration_${iteration}_stderr.txt"
    local prompt_file="$OUTPUT_DIR/iteration_${iteration}_prompt.md"

    log "INFO" "Starting iteration $iteration"

    build_prompt "$iteration" > "$prompt_file"
    log "INFO" "Prompt: $(wc -l < "$prompt_file" | tr -d ' ') lines"

    log "INFO" "Running OpenCode agent..."
    echo ""

    local agent_exit_code=0
    if cat "$prompt_file" | opencode run --model "$OPENCODE_MODEL" --variant "$OPENCODE_VARIANT" --format json 2>"$stderr_file" | tee "$output_file" | stream_filter; then
        log "SUCCESS" "Agent completed iteration $iteration"
    else
        agent_exit_code=$?
        if [ $agent_exit_code -eq 130 ] || [ $agent_exit_code -eq 143 ]; then
            log "INFO" "Agent interrupted"; return 1
        fi
        log "WARN" "Agent exited with status $agent_exit_code"
    fi

    local assistant_text=$(cat "$output_file" | jq -r '
        if .type == "text" then .part.text // empty
        elif .type == "output_text" then .part.text // .text // empty
        elif .type == "output_text_delta" then .part.delta // .delta // empty
        elif .type == "final" then .part.text // .text // empty
        elif .type == "message" or .type == "assistant" then
            (
                .part.text // empty,
                (.part.content[]? | select(.type == "text" or .type == "output_text") | .text // empty),
                (.part.content[]? | select(.type == "output_text_delta") | .delta // empty)
            )
        else empty end
    ' 2>/dev/null)
    local has_task_complete=false has_nothing_left=false
    echo "$assistant_text" | grep -q "TASK_COMPLETE" && has_task_complete=true
    echo "$assistant_text" | grep -q "$COMPLETE_MARKER" && has_nothing_left=true

    if [ "$has_task_complete" = true ]; then
        log "INFO" "Agent signaled task completion"
        local task_desc=$(extract_task_description "$output_file")
        local ci_passed=true
        [ "$SKIP_CHECKS" = true ] && log "INFO" "Skipping CI checks" || { run_ci_checks || ci_passed=false; }
        if [ "$ci_passed" = true ]; then
            rm -f "$OUTPUT_DIR/ci_errors.txt"
            commit_changes "$iteration" "$task_desc" || { rollback_changes; return 1; }
            log "SUCCESS" "Task completed: $task_desc"
        else
            log "WARN" "CI failed - keeping changes for next iteration"
            return 1
        fi
    elif has_changes; then
        log "WARN" "No TASK_COMPLETE but has changes"
        local ci_passed=true
        [ "$SKIP_CHECKS" = true ] || { run_ci_checks || ci_passed=false; }
        [ "$ci_passed" = true ] && { rm -f "$OUTPUT_DIR/ci_errors.txt"; commit_changes "$iteration" "Partial work"; }
    fi

    if [ "$has_nothing_left" = true ]; then
        log "SUCCESS" "Agent signaled NOTHING_LEFT_TO_DO"
        if [ "$USE_JUDGE" = true ]; then
            local judge_result=0
            run_judge "$iteration" || judge_result=$?
            if [ $judge_result -eq 1 ]; then
                log "INFO" "Resuming main agent loop per judge verdict"
                return 1
            elif [ $judge_result -eq 2 ]; then
                return 1
            fi
        fi
        return 0
    fi
    return 1
}

main() {
    log "INFO" "=========================================="
    log "INFO" "Starting Ralph Auto Loop"
    log "INFO" "=========================================="
    log "INFO" "Focus: $FOCUS_PROMPT"
    [ "$MAX_ITERATIONS" -gt 0 ] && log "INFO" "Max iterations: $MAX_ITERATIONS"
    [ "$USE_JUDGE" = true ] && log "INFO" "Judge: enabled"
    [ "$JUDGE_FIRST" = true ] && log "INFO" "Judge-first: enabled"
    [ "$SKIP_CHECKS" = true ] && log "WARN" "Skip checks: enabled"

    check_prerequisites

    local start_time=$(date +%s) iteration=1 completed=false

    if [ "$SKIP_CHECKS" = true ]; then
        log "INFO" "Skipping initial CI checks"
        rm -f "$OUTPUT_DIR/ci_errors.txt"
    else
        log "INFO" "Running initial CI checks..."
        run_ci_checks && rm -f "$OUTPUT_DIR/ci_errors.txt" || log "WARN" "Initial CI failed"
    fi

    if [ "$JUDGE_FIRST" = true ] && [ "$USE_JUDGE" = true ]; then
        log "INFO" "Running judge before main loop..."
        local judge_result=0
        run_judge 0 || judge_result=$?
        if [ $judge_result -eq 0 ]; then
            log "SUCCESS" "Judge says ALL_WORK_DONE before starting"
            completed=true
        elif [ $judge_result -eq 2 ]; then
            log "INFO" "Judge interrupted"
            exit 130
        else
            log "INFO" "Judge found issues, proceeding to main loop"
        fi
    fi

    if [ "$completed" = true ]; then
        log "INFO" "=========================================="
        log "INFO" "Complete. Iterations: 0, Duration: $(($(date +%s) - start_time))s"
        log "SUCCESS" "All work completed (judge-first)!"
        exit 0
    fi

    while true; do
        log "INFO" "------------------------------------------"
        log "INFO" "ITERATION $iteration"
        log "INFO" "------------------------------------------"

        if run_iteration $iteration; then
            log "SUCCESS" "Nothing left to do!"
            completed=true
            break
        fi

        [ "$MAX_ITERATIONS" -gt 0 ] && [ "$iteration" -ge "$MAX_ITERATIONS" ] && {
            log "WARN" "Reached max iterations"; break
        }

        sleep 2
        ((iteration++))
    done

    log "INFO" "=========================================="
    log "INFO" "Complete. Iterations: $iteration, Duration: $(($(date +%s) - start_time))s"
    [ "$completed" = true ] && log "SUCCESS" "All work completed!"
    log "INFO" "Recent commits:"
    git log --oneline -5 --grep="Ralph-Auto" || true
    exit 0
}

main
